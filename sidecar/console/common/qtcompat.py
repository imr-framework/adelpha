"""Allow MRI4ALL sequence and IPC code to import without a Qt GUI.

Adelpha's Imaging Console is React. Sequence modules and Communicator still
import PyQt5 at module load; the sidecar does not ship PyQt5. Installing a
minimal stub lets SequenceBase register and run_sequence talk to MaRCoS.
"""

from __future__ import annotations

import os
import sys
import types
from typing import Any


class _Dummy:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        pass

    def __getattr__(self, name: str) -> Any:
        return _Dummy()

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        return _Dummy()

    def __iter__(self):
        return iter(())

    def __bool__(self) -> bool:
        return True

    def __getitem__(self, _key: Any) -> Any:
        return _Dummy()


class _Qt:
    class Orientation:
        Horizontal = 1
        Vertical = 2

    class AlignmentFlag:
        AlignCenter = 0
        AlignLeft = 1
        AlignRight = 2

    Horizontal = 1
    Vertical = 2
    Checked = 2
    Unchecked = 0
    WindowType = _Dummy
    WidgetAttribute = _Dummy


def _pyqt_signal(*_args: Any, **_kwargs: Any) -> _Dummy:
    return _Dummy()


def _pyqt_slot(*_args: Any, **_kwargs: Any):
    def deco(fn):
        return fn

    return deco


_WIDGET_NAMES = (
    "QWidget",
    "QApplication",
    "QMainWindow",
    "QDialog",
    "QLabel",
    "QPushButton",
    "QVBoxLayout",
    "QHBoxLayout",
    "QGridLayout",
    "QFormLayout",
    "QSlider",
    "QDial",
    "QSpinBox",
    "QDoubleSpinBox",
    "QCheckBox",
    "QComboBox",
    "QLineEdit",
    "QTextEdit",
    "QGroupBox",
    "QTabWidget",
    "QFrame",
    "QMessageBox",
    "QFileDialog",
    "QAction",
    "QMenu",
    "QMenuBar",
    "QStatusBar",
    "QToolBar",
    "QListWidget",
    "QTableWidget",
    "QTreeWidget",
    "QProgressBar",
    "QRadioButton",
    "QButtonGroup",
    "QSplitter",
    "QScrollArea",
    "QSizePolicy",
    "QSpacerItem",
    "QLayout",
    "QStackedWidget",
    "QAbstractItemView",
    "QHeaderView",
)

_GUI_NAMES = (
    "QIcon",
    "QPixmap",
    "QColor",
    "QFont",
    "QPainter",
    "QPen",
    "QBrush",
    "QImage",
    "QPalette",
    "QCursor",
    "QKeySequence",
)

_CORE_NAMES = (
    "QTimer",
    "QThread",
    "QEvent",
    "QSize",
    "QRect",
    "QPoint",
    "QCoreApplication",
    "QSettings",
    "QDate",
    "QTime",
    "QDateTime",
    "QUrl",
    "QMutex",
    "Qt",
    "QObject",
    "pyqtSignal",
    "pyqtSlot",
)


def ensure_pyqt5() -> None:
    """Install PyQt5 stubs when the real package is missing or incomplete."""
    if "PyQt5.QtCore" in sys.modules:
        try:
            from PyQt5.QtCore import QObject  # noqa: F401

            return
        except Exception:
            pass

    core = types.ModuleType("PyQt5.QtCore")
    core.QObject = _Dummy
    core.pyqtSignal = _pyqt_signal
    core.pyqtSlot = _pyqt_slot
    core.Qt = _Qt
    for name in _CORE_NAMES:
        if not hasattr(core, name):
            setattr(core, name, _Dummy if name != "Qt" else _Qt)

    widgets = types.ModuleType("PyQt5.QtWidgets")
    for name in _WIDGET_NAMES:
        setattr(widgets, name, _Dummy)

    gui = types.ModuleType("PyQt5.QtGui")
    for name in _GUI_NAMES:
        setattr(gui, name, _Dummy)

    uic = types.ModuleType("PyQt5.uic")

    def loadUi(*_args: Any, **_kwargs: Any) -> None:
        return None

    uic.loadUi = loadUi

    pyqt = types.ModuleType("PyQt5")
    pyqt.QtCore = core
    pyqt.QtWidgets = widgets
    pyqt.QtGui = gui
    pyqt.uic = uic

    sys.modules["PyQt5"] = pyqt
    sys.modules["PyQt5.QtCore"] = core
    sys.modules["PyQt5.QtWidgets"] = widgets
    sys.modules["PyQt5.QtGui"] = gui
    sys.modules["PyQt5.uic"] = uic


def configure_headless() -> None:
    """Qt stubs plus a non-interactive matplotlib backend for the sidecar."""
    os.environ.setdefault("MPLBACKEND", "Agg")
    ensure_pyqt5()
    try:
        import matplotlib

        matplotlib.use("Agg")
    except Exception:
        pass
