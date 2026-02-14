//! Partner profile inference from auction history

use crate::nbk::HandConstraint;
use bridge_core::{Distribution, Shape, Suit};

/// Inferred profile of partner's hand based on auction history
#[derive(Debug, Clone, Default)]
pub struct PartnerModel {
    /// Minimum distribution partner has shown (minimum length in each suit)
    pub min_distribution: Distribution,
    /// Minimum HCP partner has shown, if any
    pub min_hcp: Option<u8>,
    /// Maximum HCP partner has shown, if any
    pub max_hcp: Option<u8>,
    /// Maximum unbalancedness allowed (max shape)
    pub max_shape: Option<Shape>,
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
            HandConstraint::MaxUnbalancedness(shape) => {
                self.max_shape = Some(update_shape_max(self.max_shape, shape));
            }
        }
    }

    pub fn has_shown_suit(&self, suit: Suit) -> bool {
        self.min_distribution.length(suit) > 0
    }

    #[allow(dead_code)]
    pub fn shown_suits(&self) -> Vec<Suit> {
        Suit::ALL
            .iter()
            .filter(|&&suit| self.min_distribution.length(suit) > 0)
            .copied()
            .collect()
    }

    pub fn min_length(&self, suit: Suit) -> u8 {
        self.min_distribution.length(suit)
    }

    pub fn length_needed_to_reach_target(&self, suit: Suit, target_len: u8) -> u8 {
        target_len.saturating_sub(self.min_length(suit))
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
    use bridge_core::{Auction, Call, Position, Strain};

    fn make_auction_with_bids(dealer: Position, calls: Vec<Call>) -> Auction {
        let mut auction = Auction::new(dealer);
        for call in calls {
            auction.calls.push(call);
        }
        auction
    }

    #[test]
    fn test_empty_auction() {
        let auction = Auction::new(Position::North);
        let auction_model = AuctionModel::from_auction(&auction, Position::South);
        let model = auction_model.partner_model;

        assert_eq!(model.min_hcp, None);
        assert_eq!(model.max_hcp, None);
        assert_eq!(model.shown_suits().len(), 0);
    }

    #[test]
    fn test_1nt_opening() {
        let auction = make_auction_with_bids(
            Position::North,
            vec![Call::Bid {
                level: 1,
                strain: Strain::NoTrump,
            }],
        );
        let auction_model = AuctionModel::from_auction(&auction, Position::South);
        let model = auction_model.partner_model;

        assert_eq!(model.min_hcp, Some(19));
        assert_eq!(model.max_hcp, Some(21));
    }

    #[test]
    fn test_one_spade_opening() {
        let auction = make_auction_with_bids(
            Position::North,
            vec![Call::Bid {
                level: 1,
                strain: Strain::Spades,
            }],
        );
        let auction_model = AuctionModel::from_auction(&auction, Position::South);
        let model = auction_model.partner_model;

        assert_eq!(model.min_hcp, Some(16));
        assert_eq!(model.min_length(Suit::Spades), 4);
        assert!(model.has_shown_suit(Suit::Spades));
    }

    #[test]
    fn test_partner_position_filtering() {
        // North opens 1S, East passes, South opens 1H
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
            ],
        );

        // From South's perspective, North is partner
        let auction_model = AuctionModel::from_auction(&auction, Position::South);
        let model = auction_model.partner_model;
        assert!(model.has_shown_suit(Suit::Spades));
        assert!(!model.has_shown_suit(Suit::Hearts)); // South's own bid shouldn't appear
    }

    #[test]
    fn test_two_level_bid() {
        let auction = make_auction_with_bids(
            Position::North,
            vec![Call::Bid {
                level: 2,
                strain: Strain::Diamonds,
            }],
        );
        let auction_model = AuctionModel::from_auction(&auction, Position::South);
        let model = auction_model.partner_model;

        assert_eq!(model.min_length(Suit::Diamonds), 4);
        assert_eq!(model.min_hcp, Some(19));
    }

    #[test]
    fn test_pass_doesnt_update() {
        let auction = make_auction_with_bids(
            Position::North,
            vec![
                Call::Bid {
                    level: 1,
                    strain: Strain::Clubs,
                },
                Call::Pass, // East
                Call::Pass, // South (our partner passed)
            ],
        );

        // Partner passed - should have no information from South
        let auction_model = AuctionModel::from_auction(&auction, Position::North);
        let model = auction_model.partner_model;
        // North's own bid shouldn't appear in their partner model
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

        // Tighten shape
        model.apply_constraint(HandConstraint::MaxUnbalancedness(Shape::Balanced));
        assert_eq!(model.max_shape, Some(Shape::Balanced));

        // Try to loosen shape (should stay at Balanced)
        model.apply_constraint(HandConstraint::MaxUnbalancedness(Shape::Unbalanced));
        assert_eq!(model.max_shape, Some(Shape::Balanced));
    }
}
