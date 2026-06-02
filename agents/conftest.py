"""Root conftest.py — ensures agents/ is on sys.path so `tests.conftest` is importable."""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
