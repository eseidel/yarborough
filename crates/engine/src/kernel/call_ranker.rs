//! Call ranker for structured bidding interfaces
//!
//! Provides a way to group legal calls by their semantic meaning.

use crate::kernel::{AuctionModel, CallInterpreter, CallPurpose, CallSemantics};
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
                    semantics.get_purpose(auction_model)
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
