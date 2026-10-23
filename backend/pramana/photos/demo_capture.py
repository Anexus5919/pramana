"""A throwaway capture-signing PKI for fixtures and tests: one self-signed DEMO CA and per-device signing
certificates, used to embed C2PA Content Credentials in demo photos. Not a real trust list.
"""

import io
import struct
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
from PIL import Image

from .credentials import DEMO_CA_NAME

GENERATOR = {"name": "Pramana demo capture app", "version": "0.1"}


@dataclass
class Device:
    chain_pem: bytes
    key_pem: bytes


def _name(cn: str, org: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
                      x509.NameAttribute(NameOID.ORGANIZATION_NAME, org),
                      x509.NameAttribute(NameOID.COMMON_NAME, cn)])


def build_ca(start: datetime | None = None) -> tuple[x509.Certificate, ec.EllipticCurvePrivateKey]:
    start = start or datetime(2024, 1, 1, tzinfo=UTC)
    key = ec.generate_private_key(ec.SECP256R1())
    name = _name(DEMO_CA_NAME, "Pramana prototype (DEMO)")
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(start)
            .not_valid_after(start + timedelta(days=3650))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(x509.KeyUsage(False, False, False, False, False, True, True, False, False), critical=True)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
            .sign(key, hashes.SHA256()))
    return cert, key


def device(ca: tuple[x509.Certificate, ec.EllipticCurvePrivateKey], cn: str, org: str,
           start: datetime | None = None) -> Device:
    start = start or datetime(2024, 1, 1, tzinfo=UTC)
    ca_cert, ca_key = ca
    key = ec.generate_private_key(ec.SECP256R1())
    cert = (x509.CertificateBuilder().subject_name(_name(cn, org)).issuer_name(ca_cert.subject)
            .public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(start)
            .not_valid_after(start + timedelta(days=1825))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.KeyUsage(True, False, False, False, False, False, False, False, False), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.EMAIL_PROTECTION]), critical=False)
            .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
            .sign(ca_key, hashes.SHA256()))
    pem = serialization.Encoding.PEM
    return Device(cert.public_bytes(pem) + ca_cert.public_bytes(pem),
                  key.private_bytes(pem, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))


def sign_jpeg(data: bytes, dev: Device, title: str, captured: datetime) -> bytes:
    """Embed a C2PA manifest stating a digital capture at `captured`, signed by the device certificate."""
    import c2pa

    manifest = {
        "claim_generator_info": [GENERATOR], "title": title, "format": "image/jpeg",
        "assertions": [{"label": "c2pa.actions", "data": {"actions": [{
            "action": "c2pa.created", "when": captured.isoformat(),
            "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"}]}}],
    }
    signer = c2pa.Signer.from_info(c2pa.C2paSignerInfo(c2pa.C2paSigningAlg.ES256, dev.chain_pem, dev.key_pem, None))
    out = io.BytesIO()
    with c2pa.Builder(manifest) as b:
        b.sign(signer, "image/jpeg", io.BytesIO(data), out)
    return out.getvalue()


def _segments(data: bytes):
    i = 2
    while i + 4 <= len(data) and data[i] == 0xFF:
        m = data[i + 1]
        if m == 0xDA:
            return
        n = struct.unpack(">H", data[i + 2:i + 4])[0]
        yield m, i, i + 2 + n
        i += 2 + n


def edit_after_signing(signed: bytes, edit: Callable[[Image.Image], Image.Image]) -> bytes:
    """Re-encode edited pixels and carry the original manifest segments over unchanged, as a careless
    editor would. The manifest still validates as signed; its hash no longer matches the file."""
    segs = list(_segments(signed))
    app11 = b"".join(signed[s:e] for m, s, e in segs if m == 0xEB)
    with Image.open(io.BytesIO(signed)) as im:
        exif = im.getexif()
        edited = edit(im.convert("RGB"))
    b = io.BytesIO()
    edited.save(b, "JPEG", quality=90, exif=exif)
    raw = b.getvalue()
    # Insert after APP0/APP1 like the signer placed the store
    end = 2
    for m, _s, e in _segments(raw):
        if m in (0xE0, 0xE1):
            end = e
        else:
            break
    return raw[:end] + app11 + raw[end:]
