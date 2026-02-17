//! Types of predefined call purposes in the Kernel model
use serde::{Deserialize, Serialize};

/// Types of predefined call groups in the Kernel model
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum CallPurpose {
    SupportMajors = 0,
    EnterNotrumpSystem = 1,
    MajorDiscovery = 2,
    CharacterizeStrength = 3,
    SupportMinors = 4,
    MinorDiscovery = 5,
    RebidSuit = 6,
    Miscellaneous = 7,
}

impl CallPurpose {
    /// Get the display name for the group type
    pub fn name(&self) -> &'static str {
        match self {
            Self::SupportMajors => "Support Majors",
            Self::EnterNotrumpSystem => "Enter Notrump System",
            Self::MajorDiscovery => "Major Discovery",
            Self::CharacterizeStrength => "Characterize Strength",
            Self::SupportMinors => "Support Minors",
            Self::MinorDiscovery => "Minor Discovery",
            Self::RebidSuit => "Rebid Suit",
            Self::Miscellaneous => "Miscellaneous",
        }
    }

    pub const COUNT: usize = 8;

    /// All available group types in priority order
    pub const ALL: [Self; Self::COUNT] = [
        Self::SupportMajors,
        Self::EnterNotrumpSystem,
        Self::MajorDiscovery,
        Self::CharacterizeStrength,
        Self::SupportMinors,
        Self::MinorDiscovery,
        Self::RebidSuit,
        Self::Miscellaneous,
    ];
}
