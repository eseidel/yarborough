//! Types of predefined call purposes in the Kernel model
use serde::{Deserialize, Serialize};

/// Types of predefined call groups in the Kernel model
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum CallPurpose {
    SupportMajors = 0,
    EnterNotrumpSystem = 1,
    MajorDiscovery = 2,
    CharacterizeStrength = 3,
    CompetitiveAction = 4,
    SupportMinors = 5,
    MinorDiscovery = 6,
    RebidSuit = 7,
    Miscellaneous = 8,
}

impl CallPurpose {
    /// Get the display name for the group type
    pub fn name(&self) -> &'static str {
        match self {
            Self::SupportMajors => "Support Majors",
            Self::EnterNotrumpSystem => "Enter Notrump System",
            Self::MajorDiscovery => "Major Discovery",
            Self::CharacterizeStrength => "Characterize Strength",
            Self::CompetitiveAction => "Competitive Action",
            Self::SupportMinors => "Support Minors",
            Self::MinorDiscovery => "Minor Discovery",
            Self::RebidSuit => "Rebid Suit",
            Self::Miscellaneous => "Miscellaneous",
        }
    }

    /// All available group types in priority order
    pub const ALL: [Self; 9] = [
        Self::SupportMajors,
        Self::EnterNotrumpSystem,
        Self::MajorDiscovery,
        Self::CharacterizeStrength,
        Self::CompetitiveAction,
        Self::SupportMinors,
        Self::MinorDiscovery,
        Self::RebidSuit,
        Self::Miscellaneous,
    ];
}
