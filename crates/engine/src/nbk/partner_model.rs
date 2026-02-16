//! Partner profile inference from auction history

use crate::nbk::HandConstraint;
use serde::{Deserialize, Serialize};
use std::fmt;
use types::{Distribution, Shape, Suit};

// TODO(eseidel): rename to HandModel.
/// Inferred profile of partner's hand based on auction history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartnerModel {
    /// Minimum distribution partner has shown (minimum length in each suit)
    pub min_distribution: Distribution,
    /// Maximum distribution partner has shown (maximum length in each suit)
    pub max_distribution: Distribution,
    /// Minimum HCP partner has shown, if any
    pub min_hcp: Option<u8>,
    /// Maximum HCP partner has shown, if any
    pub max_hcp: Option<u8>,
    /// Maximum unbalancedness allowed (max shape)
    pub max_shape: Option<Shape>,
}

impl Default for PartnerModel {
    fn default() -> Self {
        Self {
            min_distribution: Distribution::default(),
            max_distribution: Distribution::max(),
            min_hcp: None,
            max_hcp: None,
            max_shape: None,
        }
    }
}

impl PartnerModel {
    pub fn apply_constraint(&mut self, constraint: HandConstraint) {
        match constraint {
            HandConstraint::MinHcp(hcp) => self.min_hcp = Some(update_min(self.min_hcp, hcp)),
            HandConstraint::MaxHcp(hcp) => self.max_hcp = Some(update_max(self.max_hcp, hcp)),
            HandConstraint::MinLength(suit, len) => {
                let current = self.min_distribution.length(suit);
                self.min_distribution.set_length(suit, current.max(len));
            }
            HandConstraint::MaxLength(suit, len) => {
                let current = self.max_distribution.length(suit);
                self.max_distribution.set_length(suit, current.min(len));
            }
            HandConstraint::MaxUnbalancedness(shape) => {
                self.max_shape = Some(update_shape_max(self.max_shape, shape));
            }
            HandConstraint::RuleOfTwenty | HandConstraint::RuleOfFifteen => {
                // Complex constraints not currently tracked in partner model
            }
        }
    }

    pub fn has_shown_suit(&self, suit: Suit) -> bool {
        self.min_distribution.length(suit) > 0
    }

    pub fn min_length(&self, suit: Suit) -> u8 {
        self.min_distribution.length(suit)
    }

    pub fn max_length(&self, suit: Suit) -> u8 {
        self.max_distribution.length(suit)
    }

    pub fn length_needed_to_reach_target(&self, suit: Suit, target_len: u8) -> u8 {
        target_len.saturating_sub(self.min_length(suit))
    }
}

impl fmt::Display for PartnerModel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut parts = Vec::new();

        // 1. HCP part
        let hcp_str = match (self.min_hcp, self.max_hcp) {
            (None, None) => "? hcp".to_string(),
            (Some(min), None) => format!("{}+ hcp", min),
            (None, Some(max)) => format!("0-{} hcp", max),
            (Some(min), Some(max)) if min == max => format!("{} hcp", min),
            (Some(min), Some(max)) => format!("{}-{} hcp", min, max),
        };
        parts.push(hcp_str);

        // 2. Suits part
        let mut suit_parts = Vec::new();
        for suit in Suit::ALL {
            let min = self.min_length(suit);
            let max = self.max_length(suit);
            let symbol = suit.symbol();

            let s = match (min, max) {
                (0, 13) => Default::default(),
                (m, 13) if m > 0 => format!("{}+{}", m, symbol),
                (0, m) => format!("0-{}{}", m, symbol),
                (min, max) if min == max => format!("{}{}", min, symbol),
                (min, max) => format!("{}-{}{}", min, max, symbol),
            };
            suit_parts.push(s);
        }
        let suit_str = suit_parts
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        if !suit_str.is_empty() {
            parts.push(suit_str);
        }

        write!(f, "{}", parts.join(", "))
    }
}

/// Update minimum value, taking the maximum of current and new
fn update_min(current: Option<u8>, new: u8) -> u8 {
    current.map(|c| c.max(new)).unwrap_or(new)
}

/// Update maximum value, taking the minimum of current and new
fn update_max(current: Option<u8>, new: u8) -> u8 {
    current.map(|c| c.min(new)).unwrap_or(new)
}

/// Update maximum shape, taking the minimum of current and new
fn update_shape_max(current: Option<Shape>, new: Shape) -> Shape {
    current.map(|c| c.min(new)).unwrap_or(new)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nbk::AuctionModel;
    use types::{Auction, Call, Position, Strain};

    fn make_auction_with_bids(dealer: Position, calls: Vec<Call>) -> Auction {
        let mut auction = Auction::new(dealer);
        for call in calls {
            auction.calls.push(call);
        }
        auction
    }

    #[test]
    fn test_empty_auction() {
        let auction = Auction::new(Position::South);
        let auction_model = AuctionModel::from_auction(&auction);
        let model = auction_model.partner_model().clone();

        assert_eq!(model.min_hcp, None);
        assert_eq!(model.max_hcp, None);
        assert_eq!(model.max_length(Suit::Spades), 13);
    }

    #[test]
    fn test_1nt_opening() {
        // N opens 1NT, E passes → current_player = South
        let auction = make_auction_with_bids(
            Position::North,
            vec![
                Call::Bid {
                    level: 1,
                    strain: Strain::NoTrump,
                },
                Call::Pass, // East
            ],
        );
        let auction_model = AuctionModel::from_auction(&auction);
        let model = auction_model.partner_model().clone();

        assert_eq!(model.min_hcp, Some(15));
        assert_eq!(model.max_hcp, Some(17));
    }

    #[test]
    fn test_one_spade_opening() {
        // N opens 1S, E passes → current_player = South
        let auction = make_auction_with_bids(
            Position::North,
            vec![
                Call::Bid {
                    level: 1,
                    strain: Strain::Spades,
                },
                Call::Pass, // East
            ],
        );
        let auction_model = AuctionModel::from_auction(&auction);
        let model = auction_model.partner_model().clone();

        assert_eq!(model.min_hcp, Some(12));
        assert_eq!(model.min_length(Suit::Spades), 5);
        assert!(model.has_shown_suit(Suit::Spades));
    }

    #[test]
    fn test_partner_position_filtering() {
        // N:1S, E:P, S:1H, W:P → current_player = North
        // From North's perspective, partner (South) bid 1H
        let auction = make_auction_with_bids(
            Position::North,
            vec![
                Call::Bid {
                    level: 1,
                    strain: Strain::Spades,
                }, // North
                Call::Pass, // East
                Call::Bid {
                    level: 1,
                    strain: Strain::Hearts,
                }, // South
                Call::Pass, // West
            ],
        );

        let auction_model = AuctionModel::from_auction(&auction);
        let model = auction_model.partner_model().clone();
        // Partner (South) bid 1H — should show hearts
        assert!(model.has_shown_suit(Suit::Hearts));
        // North's own 1S bid shouldn't appear in partner model
        assert!(!model.has_shown_suit(Suit::Spades));
    }

    #[test]
    fn test_two_level_bid() {
        // N opens 2D, E passes → current_player = South
        let auction = make_auction_with_bids(
            Position::North,
            vec![
                Call::Bid {
                    level: 2,
                    strain: Strain::Diamonds,
                },
                Call::Pass, // East
            ],
        );
        let auction_model = AuctionModel::from_auction(&auction);
        let model = auction_model.partner_model().clone();

        assert_eq!(model.min_length(Suit::Diamonds), 6);
        assert_eq!(model.min_hcp, Some(5));
    }

    #[test]
    fn test_pass_does_not_update() {
        // N:1C, E:P, S:P → current_player = West
        // From West's perspective, partner (East) only passed
        let auction = make_auction_with_bids(
            Position::North,
            vec![
                Call::Bid {
                    level: 1,
                    strain: Strain::Clubs,
                },
                Call::Pass, // East (West's partner)
                Call::Pass, // South
            ],
        );

        let auction_model = AuctionModel::from_auction(&auction);
        let model = auction_model.partner_model().clone();
        // Partner (East) only passed — no suit info should be present
        assert!(!model.has_shown_suit(Suit::Clubs));
    }

    #[test]
    fn test_apply_constraint() {
        let mut model = PartnerModel::default();

        model.apply_constraint(HandConstraint::MinHcp(10));
        assert_eq!(model.min_hcp, Some(10));

        model.apply_constraint(HandConstraint::MaxHcp(15));
        assert_eq!(model.max_hcp, Some(15));

        model.apply_constraint(HandConstraint::MinLength(Suit::Spades, 5));
        assert_eq!(model.min_length(Suit::Spades), 5);

        // Tighten
        model.apply_constraint(HandConstraint::MinHcp(12));
        assert_eq!(model.min_hcp, Some(12));

        model.apply_constraint(HandConstraint::MaxHcp(14));
        assert_eq!(model.max_hcp, Some(14));

        model.apply_constraint(HandConstraint::MinLength(Suit::Spades, 6));
        assert_eq!(model.min_length(Suit::Spades), 6);

        model.apply_constraint(HandConstraint::MaxUnbalancedness(Shape::SemiBalanced));
        assert_eq!(model.max_shape, Some(Shape::SemiBalanced));

        model.apply_constraint(HandConstraint::MaxUnbalancedness(Shape::Balanced));
        assert_eq!(model.max_shape, Some(Shape::Balanced));

        model.apply_constraint(HandConstraint::MaxLength(Suit::Hearts, 4));
        assert_eq!(model.max_length(Suit::Hearts), 4);

        // Tighten max length
        model.apply_constraint(HandConstraint::MaxLength(Suit::Hearts, 3));
        assert_eq!(model.max_length(Suit::Hearts), 3);

        // Try to loosen (should stay at 3)
        model.apply_constraint(HandConstraint::MaxLength(Suit::Hearts, 5));
        assert_eq!(model.max_length(Suit::Hearts), 3);
        assert_eq!(model.max_shape, Some(Shape::Balanced));
    }

    #[test]
    fn test_display() {
        let mut model = PartnerModel::default();
        // Initial state: ? hcp (suits are unknown and thus omitted)
        assert_eq!(model.to_string(), "? hcp");

        model.apply_constraint(HandConstraint::MinHcp(10));
        assert_eq!(model.to_string(), "10+ hcp");

        model.apply_constraint(HandConstraint::MinLength(Suit::Clubs, 4));
        assert_eq!(model.to_string(), "10+ hcp, 4+♣️");

        let mut model2 = PartnerModel::default();
        model2.apply_constraint(HandConstraint::MinHcp(15));
        model2.apply_constraint(HandConstraint::MaxHcp(17));
        model2.apply_constraint(HandConstraint::MinLength(Suit::Clubs, 2));
        model2.apply_constraint(HandConstraint::MaxLength(Suit::Clubs, 5));
        model2.apply_constraint(HandConstraint::MinLength(Suit::Diamonds, 2));
        model2.apply_constraint(HandConstraint::MaxLength(Suit::Diamonds, 5));
        model2.apply_constraint(HandConstraint::MinLength(Suit::Hearts, 2));
        model2.apply_constraint(HandConstraint::MaxLength(Suit::Hearts, 5));
        model2.apply_constraint(HandConstraint::MinLength(Suit::Spades, 2));
        model2.apply_constraint(HandConstraint::MaxLength(Suit::Spades, 3));
        assert_eq!(model2.to_string(), "15-17 hcp, 2-5♣️ 2-5♦️ 2-5❤️ 2-3♠️");

        let mut model3 = PartnerModel::default();
        model3.apply_constraint(HandConstraint::MaxHcp(5));
        model3.apply_constraint(HandConstraint::MaxLength(Suit::Spades, 4));
        assert_eq!(model3.to_string(), "0-5 hcp, 0-4♠️");
    }
}
