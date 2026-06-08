import httpx

tokens = ("429", "503", "RESOURCE_EXHAUSTED", "UNAVAILABLE", "timed out", "Connect")


def show(label, exc):
    s = str(exc)
    hit = [t for t in tokens if t in s]
    print(f"{label}: type={type(exc).__name__} "
          f"is_TimeoutException={isinstance(exc, httpx.TimeoutException)} "
          f"is_TransportError={isinstance(exc, httpx.TransportError)}")
    print(f"   str()={s!r}")
    print(f"   tokens_matched={hit}  -> RETRIED={bool(hit)}")


print("httpx", httpx.__version__)
# Empty-message forms (httpx wraps lower-level errors; message is frequently empty)
show("ConnectTimeout('')", httpx.ConnectTimeout(""))
show("ReadTimeout('')", httpx.ReadTimeout(""))
show("ConnectError('')", httpx.ConnectError(""))
show("PoolTimeout('')", httpx.PoolTimeout(""))
# Realistic underlying-message forms
show("ConnectTimeout(ssl)", httpx.ConnectTimeout("_ssl.c:980: The handshake operation timed out"))
show("ConnectError(refused)", httpx.ConnectError("[Errno 111] Connection refused"))
show("ConnectError(dns)", httpx.ConnectError("[Errno -2] Name or service not known"))
show("ReadError(reset)", httpx.ReadError("[Errno 104] Connection reset by peer"))
