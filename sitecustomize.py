"""Repo-local sitecustomize.

Python automatically imports `sitecustomize` (if present on sys.path) during
startup. We use this to enforce `NO_NETWORK=1` for subprocess jobs.

This is intentionally a no-op unless NO_NETWORK is set.
"""

from __future__ import annotations

import os


def _install() -> None:
    if os.getenv("NO_NETWORK") != "1":
        return

    import socket

    msg = "NO_NETWORK=1: outbound network disabled"

    def _blocked(*args, **kwargs):
        raise RuntimeError(msg)

    socket.create_connection = _blocked  # type: ignore[assignment]

    orig_socket = socket.socket

    class GuardedSocket(orig_socket):
        def connect(self, *args, **kwargs):  # type: ignore[override]
            raise RuntimeError(msg)

    socket.socket = GuardedSocket  # type: ignore[assignment]


_install()
