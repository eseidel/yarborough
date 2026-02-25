//! Types of predefined call purposes in the Kernel model
use serde::{Deserialize, Serialize};

/// Types of predefined call groups in the Kernel model
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum CallPurpose {
    ConventionalResponse = 0,
    SupportMajors = 1,
    EnterNotrumpSystem = 2,
    MajorDiscovery = 3,
    CharacterizeStrength = 4,
    SupportMinors = 5,
    MinorDiscovery = 6,
    RebidSuit = 7,
    Miscellaneous = 8,
}

impl CallPurpose {
    /// Get the display name for the group type
    pub fn name(&self) -> &'static str {
        match self {
            Self::ConventionalResponse => "Conventional Response",
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

    pub const COUNT: usize = 9;

    /// All available group types in priority order
    pub const ALL: [Self; Self::COUNT] = [
        Self::ConventionalResponse,
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
