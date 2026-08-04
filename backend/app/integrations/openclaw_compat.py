"""Compatibility shim for the ``openclaw`` package.

``openclaw`` (2026.3.20, the latest release) imports ``CMDOPClient``,
``AsyncCMDOPClient``, and a ``cmdop.exceptions`` module — names that no
published ``cmdop`` release exports (cmdop 1.x exposes ``Client`` and
``cmdop.errors``). This shim installs aliases for those legacy names
*before* importing openclaw, so the wrapper imports cleanly against
cmdop 1.1.x.

Remove once openclaw ships a release compatible with cmdop >= 1.1.

Usage::

    from app.integrations.openclaw_compat import load_openclaw

    openclaw = load_openclaw()          # module or None
"""

import logging
import sys
import types

logger = logging.getLogger(__name__)

_openclaw_module = None
_load_attempted = False


def _install_cmdop_aliases() -> None:
    import cmdop
    import cmdop.errors as cmdop_errors

    # Legacy client names -> the modern async Client
    if not hasattr(cmdop, "CMDOPClient"):
        cmdop.CMDOPClient = cmdop.Client
    if not hasattr(cmdop, "AsyncCMDOPClient"):
        cmdop.AsyncCMDOPClient = cmdop.Client

    # Legacy exceptions module -> aliases into cmdop.errors
    if "cmdop.exceptions" not in sys.modules:
        exceptions = types.ModuleType("cmdop.exceptions")
        exceptions.CMDOPError = cmdop_errors.CmdopError
        exceptions.ConnectionError = cmdop_errors.ConnectionError
        exceptions.AuthenticationError = cmdop_errors.AuthError
        exceptions.TimeoutError = cmdop_errors.TimeoutError
        sys.modules["cmdop.exceptions"] = exceptions
        cmdop.exceptions = exceptions


def load_openclaw():
    """Import and return the openclaw module, or None if unavailable.

    The import is attempted once; failures are logged at debug level and
    cached so callers can probe cheaply.
    """
    global _openclaw_module, _load_attempted
    if _load_attempted:
        return _openclaw_module
    _load_attempted = True

    try:
        _install_cmdop_aliases()
        import openclaw

        _openclaw_module = openclaw
        logger.info("OpenClaw %s loaded (cmdop compat shim active)", openclaw.__version__)
    except Exception as exc:
        logger.warning("OpenClaw unavailable: %s", exc)
        _openclaw_module = None
    return _openclaw_module
