#! /bin/bash

docker exec leadtrackers_app python -c "
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
import base64

key = ec.generate_private_key(ec.SECP256R1())
priv = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()).decode()
pub = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
pub_b64 = base64.urlsafe_b64encode(pub).rstrip(b'=').decode()
priv_b64 = base64.urlsafe_b64encode(key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption())).rstrip(b'=').decode()
print('VAPID_PUBLIC_KEY:', pub_b64)
print('VAPID_PRIVATE_KEY:', priv_b64)
"
