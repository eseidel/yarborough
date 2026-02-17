//! Call ranker for structured bidding interfaces
//!
//! Provides a way to group legal calls by their semantic meaning.

use crate::dsl::annotations::Annotation;
use crate::kernel::{AuctionModel, CallInterpreter, CallSemantics, HandConstraint};
use serde::{Deserialize, Serialize};
use types::Call;

/// An item in the call ranker
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallRankItem {
    /// The call to be made
    pub call: Call,
    /// The semantics of the call
    pub semantics: CallSemantics,
}

/// A group of calls in the ranker
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallRankGroup {
    /// The name of the group
    pub name: String,
    /// The calls in the group
    pub items: Vec<CallRankItem>,
}

/// A structured ranker of legal calls and their meanings
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CallRanker {
    /// The groups of calls in the ranker
    pub groups: Vec<CallRankGroup>,
}

/// Types of predefined call groups in the Kernel model
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
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

impl CallRanker {
    /// Build a call ranker from an auction model using standard Kernel grouping
    pub fn from_auction_model(auction_model: &AuctionModel) -> Self {
        let legal_calls = auction_model.auction.legal_calls();

        let mut group_items: [Vec<CallRankItem>; 9] = Default::default();

        for call in legal_calls {
            if let Some(semantics) = CallInterpreter::interpret(auction_model, &call) {
                // Doubles/redoubles go to CompetitiveAction — they show values
                // and general shape but don't commit to a suit.
                let best_purpose = if matches!(call, Call::Double | Call::Redouble) {
                    CallPurpose::CompetitiveAction
                } else {
                    categorize_bid(auction_model, &semantics)
                };

                group_items[best_purpose as usize].push(CallRankItem { call, semantics });
            }
        }

        let mut ranker = Self::default();
        for group_type in CallPurpose::ALL {
            ranker = ranker.with_group(group_type.name(), group_items[group_type as usize].clone());
        }

        ranker
    }

    /// Add a group of calls to the ranker
    pub fn with_group(mut self, name: &str, items: Vec<CallRankItem>) -> Self {
        if !items.is_empty() {
            self.groups.push(CallRankGroup {
                name: name.to_string(),
                items,
            });
        }
        self
    }
}

/// Determine the purpose category for a bid based on its annotations and constraints.
fn categorize_bid(auction_model: &AuctionModel, semantics: &CallSemantics) -> CallPurpose {
    let mut best_purpose = CallPurpose::Miscellaneous;
    let mut did_show_length = false;
    let mut did_characterize_strength = false;

    // Check annotations first
    if semantics
        .annotations
        .contains(&Annotation::NotrumpSystemsOn)
    {
        best_purpose = best_purpose.min(CallPurpose::EnterNotrumpSystem);
    }

    for constraint in &semantics.shows {
        match *constraint {
            HandConstraint::MinLength(suit, now_shown) => {
                if auction_model.partner_hand().has_shown_suit(suit) {
                    if suit.is_major() {
                        best_purpose = best_purpose.min(CallPurpose::SupportMajors);
                    } else if suit.is_minor() {
                        best_purpose = best_purpose.min(CallPurpose::SupportMinors);
                    }
                } else {
                    let already_known = auction_model.bidder_hand().min_length(suit);
                    if now_shown > already_known {
                        if already_known >= 4 {
                            best_purpose = best_purpose.min(CallPurpose::RebidSuit);
                        } else if suit.is_major() {
                            best_purpose = best_purpose.min(CallPurpose::MajorDiscovery);
                        } else if suit.is_minor() {
                            best_purpose = best_purpose.min(CallPurpose::MinorDiscovery);
                        }
                    }
                }
                did_show_length = true;
            }
            HandConstraint::MinHcp(now_shown) => {
                if now_shown > auction_model.bidder_hand().min_hcp.unwrap_or(0) {
                    did_characterize_strength = true;
                }
            }
            HandConstraint::MaxHcp(now_shown) => {
                if now_shown < auction_model.bidder_hand().max_hcp.unwrap_or(40) {
                    did_characterize_strength = true;
                }
            }
            _ => {}
        }
    }

    if !did_show_length && did_characterize_strength {
        best_purpose = best_purpose.min(CallPurpose::CharacterizeStrength);
    }

    best_purpose
}

#[cfg(test)]
mod tests {
    use super::*;
    use types::{Auction, Position};

    #[test]
    fn test_call_ranker_empty_auction() {
        let auction = Auction::new(Position::North);
        let auction_model = AuctionModel::from_auction(&auction);
        let ranker = CallRanker::from_auction_model(&auction_model);

        // At the start:
        // Group: Enter Notrump System (1NT, 2NT openings)
        // Group: Major Discovery (1H, 1S)
        // Group: Characterize Strength (includes Pass)
        // Group: Minor Discovery (1C, 1D)

        assert!(ranker
            .groups
            .iter()
            .any(|g| g.name == "Enter Notrump System"));

        let characterize_strength = ranker
            .groups
            .iter()
            .find(|g| g.name == "Characterize Strength");
        assert!(characterize_strength.is_some());

        let discovery_majors = ranker.groups.iter().find(|g| g.name == "Major Discovery");
        assert!(discovery_majors.is_some());

        let discovery_minors = ranker.groups.iter().find(|g| g.name == "Minor Discovery");
        assert!(discovery_minors.is_some());
    }

    #[test]
    fn test_nt_system_higher_priority_than_major_discovery() {
        let auction = Auction::new(Position::North);
        let auction_model = AuctionModel::from_auction(&auction);
        let ranker = CallRanker::from_auction_model(&auction_model);

        let nt_idx = ranker
            .groups
            .iter()
            .position(|g| g.name == "Enter Notrump System");
        let major_idx = ranker
            .groups
            .iter()
            .position(|g| g.name == "Major Discovery");
        assert!(
            nt_idx.unwrap() < major_idx.unwrap(),
            "Enter Notrump System should appear before Major Discovery"
        );
    }

    #[test]
    fn test_call_ranker_after_opening() {
        let auction = Auction::bidding(Position::North, "1H P");

        // South's turn
        let auction_model = AuctionModel::from_auction(&auction);
        let ranker = CallRanker::from_auction_model(&auction_model);

        // South should see:
        // Group: Support Majors (2H, 3H, 4H)
        // Group: Major Discovery (1S)
        // Group: Characterize Strength (Pass, NT bids)
        // Group: Minor Discovery (2C, 2D)

        assert!(ranker.groups.iter().any(|g| g.name == "Support Majors"));
        assert!(ranker.groups.iter().any(|g| g.name == "Major Discovery"));
        assert!(ranker
            .groups
            .iter()
            .any(|g| g.name == "Characterize Strength"));
        assert!(ranker.groups.iter().any(|g| g.name == "Minor Discovery"));
    }

    #[test]
    fn test_call_ranker_after_opponent_opening() {
        let auction = Auction::bidding(Position::North, "1D");

        // East's turn to overcall
        let auction_model = AuctionModel::from_auction(&auction);
        let ranker = CallRanker::from_auction_model(&auction_model);

        // 1NT overcall should be in Enter Notrump System group
        assert!(
            ranker
                .groups
                .iter()
                .any(|g| g.name == "Enter Notrump System"),
            "1NT overcall should appear in Enter Notrump System group"
        );
    }
}
