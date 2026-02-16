from __future__ import annotations

import os
import socket
from typing import Optional


_INSTALLED = False


class NoNetworkError(RuntimeError):
    pass


def install_no_network_guard(reason: Optional[str] = None) -> None:
    """Disable outbound network in-process.

    This is used by orchestrator/tests. For subprocesses, see `sitecustomize.py`.
    """

    global _INSTALLED
    if _INSTALLED:
        return

    msg = reason or "NO_NETWORK is enabled"

    def _blocked(*args, **kwargs):
        raise NoNetworkError(msg)

    # Patch common socket entry points.
    socket.create_connection = _blocked  # type: ignore[assignment]

    orig_socket = socket.socket

    class GuardedSocket(orig_socket):
        def connect(self, *args, **kwargs):  # type: ignore[override]
            raise NoNetworkError(msg)

    socket.socket = GuardedSocket  # type: ignore[assignment]

    os.environ["NO_NETWORK"] = "1"
    _INSTALLED = True
