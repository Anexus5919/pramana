"""A throwaway PKI for fixtures: Demo Root CA -> Demo Issuing CA -> per-issuer signing certificates.

Real deployments trust India PKI roots published by CCA instead. Everything here is labelled DEMO.
"""

import io
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from asn1crypto import keys as asn1_keys
from asn1crypto import x509 as asn1_x509
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


@dataclass
class Identity:
    cert: x509.Certificate
    key: ec.EllipticCurvePrivateKey


def _name(cn: str, org: str) -> x509.Name:
    return x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, org),
        x509.NameAttribute(NameOID.COMMON_NAME, cn),
    ])


def _issue(subject: x509.Name, key, issuer: Identity | None, *, ca: bool, days: int, start: datetime) -> Identity:
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer.cert.subject if issuer else subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(start)
        .not_valid_after(start + timedelta(days=days))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
    )
    if ca:
        builder = builder.add_extension(
            x509.KeyUsage(False, False, False, False, False, True, True, False, False), critical=True
        )
    else:
        builder = builder.add_extension(
            x509.KeyUsage(True, True, False, False, False, False, False, False, False), critical=True
        ).add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.EMAIL_PROTECTION]), critical=False)
    if issuer:
        builder = builder.add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(issuer.key.public_key()), critical=False
        )
    signer_key = issuer.key if issuer else key
    return Identity(builder.sign(signer_key, hashes.SHA256()), key)


def build(start: datetime | None = None) -> tuple[Identity, Identity]:
    start = start or datetime(2023, 1, 1, tzinfo=UTC)
    root = _issue(_name("Pramana DEMO Root CA", "Pramana Prototype (DEMO, not India PKI)"),
                  ec.generate_private_key(ec.SECP256R1()), None, ca=True, days=3650 * 2, start=start)
    sub = _issue(_name("Pramana DEMO Issuing CA", "Pramana Prototype (DEMO, not India PKI)"),
                 ec.generate_private_key(ec.SECP256R1()), root, ca=True, days=3650, start=start)
    return root, sub


def signer(ca: Identity, cn: str, org: str, start: datetime | None = None) -> Identity:
    start = start or datetime(2024, 1, 1, tzinfo=UTC)
    return _issue(_name(cn, org), ec.generate_private_key(ec.SECP256R1()), ca, ca=False, days=1825, start=start)


def write_anchor(root: Identity, trust_dir: Path) -> Path:
    d = trust_dir / "demo"
    d.mkdir(parents=True, exist_ok=True)
    p = d / "pramana-demo-root.pem"
    p.write_bytes(root.cert.public_bytes(serialization.Encoding.PEM))
    return p


def sign_pdf(pdf_bytes: bytes, ident: Identity, chain: list[Identity], *, reason: str, location: str,
             field_name: str = "IssuerSignature") -> bytes:
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    from pyhanko.sign import signers
    from pyhanko_certvalidator.registry import SimpleCertificateStore

    def a(c: x509.Certificate) -> asn1_x509.Certificate:
        return asn1_x509.Certificate.load(c.public_bytes(serialization.Encoding.DER))

    key = asn1_keys.PrivateKeyInfo.load(
        ident.key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8,
                                serialization.NoEncryption())
    )
    s = signers.SimpleSigner(
        signing_cert=a(ident.cert),
        signing_key=key,
        cert_registry=SimpleCertificateStore.from_certs([a(c.cert) for c in chain]),
    )
    w = IncrementalPdfFileWriter(io.BytesIO(pdf_bytes))
    out = signers.sign_pdf(
        w, signers.PdfSignatureMetadata(field_name=field_name, reason=reason, location=location), signer=s
    )
    return out.getvalue()
