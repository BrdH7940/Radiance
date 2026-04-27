"""
Backward-compatibility re-exports.

The canonical location for SkillGap is now ``core.domain.skill_gap``.
This module is kept as a shim so that existing external imports continue
to work during the transition. Prefer importing directly from ``core``.
"""

from core.domain.skill_gap import SkillGap

__all__ = ["SkillGap"]
