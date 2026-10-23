"""Parser sandbox: untrusted files are parsed in separate worker processes that the server can kill.

What is enforced on every worker (details in docs/features/platform.md):
- a wall-clock timeout per operation on every OS; on expiry the worker is killed and replaced;
- a memory cap: a Windows Job Object with ProcessMemoryLimit, RLIMIT_AS on Linux; macOS has no enforced cap;
- on Windows the job also allows a single process (no child processes) and is killed with the server.

Workers are reused for up to `sandbox_max_tasks` operations and then recycled. A crash, a timeout or the memory
cap turns into SandboxUnsafe, which callers report as "could not be read safely" and route to manual review.
"""

import json
import logging
import os
import queue
import struct
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from .config import BACKEND_DIR, get_settings
from .sandbox_worker import MAX_FRAME, encode, read_frame, run_op

log = logging.getLogger(__name__)
STARTUP_TIMEOUT_S = 120
MAX_REPLY = 128 * 1024 * 1024


class SandboxError(RuntimeError):
    """The parser raised an ordinary error for this file."""


class SandboxUnsafe(SandboxError):
    """The parser crashed, ran out of memory or time, and was stopped."""


# ---------- Windows Job Object via ctypes ----------

if os.name == "nt":
    import ctypes
    from ctypes import wintypes

    class _IoCounters(ctypes.Structure):
        _fields_ = [(n, ctypes.c_ulonglong) for n in (
            "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
            "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]

    class _BasicLimits(ctypes.Structure):
        _fields_ = [("PerProcessUserTimeLimit", wintypes.LARGE_INTEGER),
                    ("PerJobUserTimeLimit", wintypes.LARGE_INTEGER),
                    ("LimitFlags", wintypes.DWORD),
                    ("MinimumWorkingSetSize", ctypes.c_size_t),
                    ("MaximumWorkingSetSize", ctypes.c_size_t),
                    ("ActiveProcessLimit", wintypes.DWORD),
                    ("Affinity", ctypes.c_size_t),
                    ("PriorityClass", wintypes.DWORD),
                    ("SchedulingClass", wintypes.DWORD)]

    class _ExtendedLimits(ctypes.Structure):
        _fields_ = [("BasicLimitInformation", _BasicLimits),
                    ("IoInfo", _IoCounters),
                    ("ProcessMemoryLimit", ctypes.c_size_t),
                    ("JobMemoryLimit", ctypes.c_size_t),
                    ("PeakProcessMemoryUsed", ctypes.c_size_t),
                    ("PeakJobMemoryUsed", ctypes.c_size_t)]

    _k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _k32.CreateJobObjectW.argtypes = [wintypes.LPVOID, wintypes.LPCWSTR]
    _k32.CreateJobObjectW.restype = wintypes.HANDLE
    _k32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, wintypes.LPVOID, wintypes.DWORD]
    _k32.SetInformationJobObject.restype = wintypes.BOOL
    _k32.QueryInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, wintypes.LPVOID, wintypes.DWORD,
                                               wintypes.LPVOID]
    _k32.QueryInformationJobObject.restype = wintypes.BOOL
    _k32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    _k32.AssignProcessToJobObject.restype = wintypes.BOOL
    _k32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    _k32.OpenProcess.restype = wintypes.HANDLE
    _k32.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
    _k32.TerminateJobObject.restype = wintypes.BOOL
    _k32.CloseHandle.argtypes = [wintypes.HANDLE]
    _k32.CloseHandle.restype = wintypes.BOOL

    _EXTENDED_INFO = 9
    _LIMIT_ACTIVE_PROCESS = 0x0008
    _LIMIT_PROCESS_MEMORY = 0x0100
    _LIMIT_DIE_ON_UNHANDLED_EXCEPTION = 0x0400
    _LIMIT_KILL_ON_JOB_CLOSE = 0x2000
    _PROCESS_SET_QUOTA = 0x0100
    _PROCESS_TERMINATE = 0x0001

    def _win_job(pid: int, mem_mb: int) -> int:
        """Put the worker in its own Job Object with a hard per-process memory limit."""
        job = _k32.CreateJobObjectW(None, None)
        if not job:
            raise ctypes.WinError(ctypes.get_last_error())
        info = _ExtendedLimits()
        info.BasicLimitInformation.LimitFlags = (_LIMIT_ACTIVE_PROCESS | _LIMIT_DIE_ON_UNHANDLED_EXCEPTION
                                                 | _LIMIT_KILL_ON_JOB_CLOSE
                                                 | (_LIMIT_PROCESS_MEMORY if mem_mb > 0 else 0))
        info.BasicLimitInformation.ActiveProcessLimit = 1
        info.ProcessMemoryLimit = mem_mb * 1024 * 1024
        if not _k32.SetInformationJobObject(job, _EXTENDED_INFO, ctypes.byref(info), ctypes.sizeof(info)):
            err = ctypes.get_last_error()
            _k32.CloseHandle(job)
            raise ctypes.WinError(err)
        proc = _k32.OpenProcess(_PROCESS_SET_QUOTA | _PROCESS_TERMINATE, False, pid)
        if not proc:
            err = ctypes.get_last_error()
            _k32.CloseHandle(job)
            raise ctypes.WinError(err)
        try:
            if not _k32.AssignProcessToJobObject(job, proc):
                err = ctypes.get_last_error()
                _k32.CloseHandle(job)
                raise ctypes.WinError(err)
        finally:
            _k32.CloseHandle(proc)
        return job

    def _win_job_peak_mb(job: int) -> float | None:
        info = _ExtendedLimits()
        if not _k32.QueryInformationJobObject(job, _EXTENDED_INFO, ctypes.byref(info), ctypes.sizeof(info), None):
            return None
        return round(info.PeakProcessMemoryUsed / 1024 / 1024, 1)


def enforcement() -> dict[str, str]:
    """What this server actually enforces on its parser workers, for the status page and the docs."""
    s = get_settings()
    if not s.parser_sandbox:
        return {"isolation": "off: files are parsed inside the server process", "memory": "not enforced",
                "timeout": "not enforced", "processes": "not limited"}
    if os.name == "nt":
        mem = f"{s.sandbox_memory_mb} MB per worker, Windows Job Object (ProcessMemoryLimit)"
        procs = "one process per job; the worker is killed when the server exits"
    elif sys.platform.startswith("linux"):
        mem = f"{s.sandbox_memory_mb} MB address space per worker (RLIMIT_AS)"
        procs = "not limited; the worker gets SIGKILL when the server exits (PR_SET_PDEATHSIG)"
    else:
        mem = "not enforced on this OS (RLIMIT_AS is not honoured by macOS)"
        procs = "not limited"
    return {"isolation": "separate worker processes, JSON replies only",
            "memory": mem, "timeout": f"{s.sandbox_timeout_s:g} s wall clock per operation, then the worker is killed",
            "processes": procs}


# ---------- Workers and pool ----------


def _send(stream, req: dict[str, Any], blob: bytes | None) -> None:
    payload = encode(req)
    stream.write(struct.pack(">I", len(payload)) + payload)
    if blob is not None:
        stream.write(struct.pack(">I", len(blob)))
        stream.write(blob)
    stream.flush()


class _Worker:
    def __init__(self, mem_mb: int):
        # One BLAS thread: OpenBLAS otherwise commits a buffer per core, about 350 MB on a 12-core laptop
        env = {"OPENBLAS_NUM_THREADS": "1", **os.environ, "PRAMANA_SANDBOX_MEMORY_MB": str(mem_mb)}
        exe, flags = sys.executable, 0
        if os.name == "nt":
            flags = subprocess.CREATE_NO_WINDOW
            base = getattr(sys, "_base_executable", exe)
            if base and os.path.normcase(base) != os.path.normcase(exe):
                # A venv's python.exe is a launcher that starts a second process, which the one-process job
                # would refuse; start the base interpreter in the venv directly, as multiprocessing does
                exe, env["__PYVENV_LAUNCHER__"] = base, sys.executable
        self.proc = subprocess.Popen([exe, "-m", "pramana.sandbox_worker"], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, cwd=str(BACKEND_DIR), env=env, creationflags=flags)
        self.job: int | None = None
        self.tasks = 0
        self.replies: queue.Queue = queue.Queue()
        try:
            if os.name == "nt":
                self.job = _win_job(self.proc.pid, mem_mb)
        except OSError as e:
            self.kill()
            raise SandboxError(f"could not apply the memory cap to a parser worker: {e}") from e
        threading.Thread(target=self._read, name=f"sandbox-reader-{self.proc.pid}", daemon=True).start()
        ready = self._next(STARTUP_TIMEOUT_S)
        if not isinstance(ready, tuple) or not ready[0].get("ready"):
            self.kill()
            raise SandboxError("parser worker did not start")
        self.pid = self.proc.pid

    def _read(self) -> None:
        out = self.proc.stdout
        try:
            while True:
                head = read_frame(out, MAX_REPLY)
                if head is None:
                    break
                msg = json.loads(head)
                blob = read_frame(out, MAX_FRAME) if msg.get("blob") else None
                self.replies.put((msg, blob))
        except Exception as e:  # noqa: BLE001  a broken reply stream counts as a crash
            log.warning("sandbox reply stream broke: %s", e)
        self.replies.put(None)

    def _next(self, timeout: float):
        try:
            return self.replies.get(timeout=timeout)
        except queue.Empty:
            return "timeout"

    def peak_mb(self) -> float | None:
        return _win_job_peak_mb(self.job) if os.name == "nt" and self.job else None

    def call(self, op: str, args: list[Any], blob: bytes | None, timeout: float) -> tuple[Any, bytes | None]:
        try:
            _send(self.proc.stdin, {"op": op, "args": args, "blob": blob is not None}, blob)
        except OSError as e:
            self.kill()
            raise SandboxUnsafe("the parser worker stopped unexpectedly") from e
        item = self._next(timeout)
        if item == "timeout":
            self.kill()
            raise SandboxUnsafe(f"the parser exceeded the {timeout:g} s time limit and was stopped")
        if item is None:
            peak = self.peak_mb()
            code = self._exit_code()
            self.kill()
            near_cap = peak is not None and peak >= 0.9 * get_settings().sandbox_memory_mb
            raise SandboxUnsafe("the parser hit its memory cap and was stopped" if near_cap else
                                f"the parser crashed (exit code {code}) and was stopped")
        msg, out = item
        if not msg.get("ok"):
            if msg.get("kind") == "memory":
                self.kill()
                raise SandboxUnsafe("the parser hit its memory cap and was stopped")
            raise SandboxError(msg.get("error") or "parser error")
        return msg.get("result"), out

    def _exit_code(self) -> int | None:
        try:
            return self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            return None

    def alive(self) -> bool:
        return self.proc.poll() is None

    def kill(self) -> None:
        try:
            if os.name == "nt" and self.job:
                _k32.TerminateJobObject(self.job, 1)
            if self.proc.poll() is None:
                self.proc.kill()
            self.proc.wait(timeout=10)
        except Exception:  # noqa: BLE001  already gone
            pass
        finally:
            for s in (self.proc.stdin, self.proc.stdout):
                try:
                    if s:
                        s.close()
                except OSError:
                    pass
            if os.name == "nt" and self.job:
                _k32.CloseHandle(self.job)
                self.job = None


@dataclass
class _Stats:
    calls: int = 0
    unsafe: int = 0
    errors: int = 0
    spawned: int = 0
    recycled: int = 0
    busy_ms: float = 0.0
    last_unsafe: list[dict[str, Any]] = field(default_factory=list)


class _Pool:
    def __init__(self) -> None:
        self._idle: list[_Worker] = []
        self._lock = threading.Lock()
        self._slots: threading.BoundedSemaphore | None = None
        self.stats = _Stats()

    def _sem(self) -> threading.BoundedSemaphore:
        with self._lock:
            if self._slots is None:
                self._slots = threading.BoundedSemaphore(max(1, get_settings().sandbox_workers))
            return self._slots

    def _take(self) -> _Worker:
        with self._lock:
            while self._idle:
                w = self._idle.pop()
                if w.alive():
                    return w
                w.kill()
        w = _Worker(get_settings().sandbox_memory_mb)
        with self._lock:
            self.stats.spawned += 1
        return w

    def call(self, op: str, args: list[Any], blob: bytes | None, timeout: float) -> tuple[Any, bytes | None]:
        s = get_settings()
        with self._sem():
            w = self._take()
            t0 = time.perf_counter()
            try:
                result = w.call(op, args, blob, timeout)
            except SandboxUnsafe as e:
                with self._lock:
                    self.stats.unsafe += 1
                    self.stats.last_unsafe = [*self.stats.last_unsafe[-4:],
                                              {"op": op, "reason": str(e), "at": datetime.now().isoformat()}]
                raise
            except SandboxError:
                with self._lock:
                    self.stats.errors += 1
                self._give_back(w, s.sandbox_max_tasks)
                raise
            finally:
                with self._lock:
                    self.stats.calls += 1
                    self.stats.busy_ms += (time.perf_counter() - t0) * 1000
            self._give_back(w, s.sandbox_max_tasks)
            return result

    def _give_back(self, w: _Worker, max_tasks: int) -> None:
        w.tasks += 1
        if w.tasks >= max_tasks or not w.alive():
            w.kill()
            with self._lock:
                self.stats.recycled += 1
            return
        with self._lock:
            self._idle.append(w)

    def workers(self) -> list[dict[str, Any]]:
        with self._lock:
            return [{"pid": w.pid, "tasks": w.tasks, "peak_mb": w.peak_mb()} for w in self._idle if w.alive()]

    def shutdown(self) -> None:
        with self._lock:
            idle, self._idle = self._idle, []
            self._slots = None
        for w in idle:
            w.kill()


_pool = _Pool()


def call(op: str, *args: Any, data: bytes | None = None, timeout: float | None = None) -> tuple[Any, bytes | None]:
    """Run a parser operation on untrusted bytes, in a worker process unless the sandbox is switched off."""
    s = get_settings()
    if not s.parser_sandbox:
        # Same JSON round trip as the worker, so both modes hand the pipeline identical values
        reply, blob = run_op(op, list(args), data)
        reply = json.loads(encode(reply))
        if not reply.get("ok"):
            raise SandboxError(reply.get("error") or "parser error")
        return reply.get("result"), blob
    return _pool.call(op, list(args), data, timeout or s.sandbox_timeout_s)


def status() -> dict[str, Any]:
    s = get_settings()
    st = _pool.stats
    return {"enabled": s.parser_sandbox, "max_workers": s.sandbox_workers, "timeout_s": s.sandbox_timeout_s,
            "memory_mb": s.sandbox_memory_mb, "max_tasks_per_worker": s.sandbox_max_tasks,
            "enforced": enforcement(), "idle_workers": _pool.workers(),
            "stats": {"calls": st.calls, "unsafe": st.unsafe, "errors": st.errors, "spawned": st.spawned,
                      "recycled": st.recycled,
                      "mean_ms": round(st.busy_ms / st.calls, 1) if st.calls else None},
            "recent_unsafe": list(st.last_unsafe)}


def shutdown() -> None:
    _pool.shutdown()


# ---------- Typed helpers for the pipeline ----------


def read_pages(data: bytes, mime: str):
    from .pipeline.text import PageText, Word, group_lines

    result, _ = call("pages", mime, data=data)
    pages = []
    for p in result:
        pt = PageText(p["page_no"], p["width"], p["height"], p["source"], [Word(*w) for w in p["words"]],
                      p["mean_conf"])
        pt.lines = group_lines(pt.words)
        pages.append(pt)
    return pages


def qr_tokens(data: bytes, mime: str, page_count: int) -> list[dict[str, Any]]:
    return call("qr", mime, page_count, data=data)[0]


def fingerprints(data: bytes, mime: str, text: str) -> dict[str, Any]:
    return call("fingerprints", mime, text, data=data)[0]


def forensics(data: bytes, mime: str, issue_date: datetime | None, campus: tuple[float, float] | None):
    from .forensics.pdf_struct import Signal

    res = call("forensics", mime, issue_date.isoformat() if issue_date else None,
               list(campus) if campus else None, data=data)[0]
    return [Signal(**s) for s in res["signals"]], res["facts"]


def render_png(data: bytes, mime: str, page_index: int, dpi: int) -> bytes:
    _, png = call("render", mime, page_index, dpi, data=data)
    if not png:
        raise SandboxError("renderer returned no image")
    return png
