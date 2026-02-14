//! Partner profile inference from auction history

use bridge_core::{Auction, Call, Distribution, Position, Strain, Suit};

/// Inferred profile of partner's hand based on auction history
#[derive(Debug, Clone, Default)]
pub struct PartnerModel {
    /// Minimum distribution partner has shown (minimum length in each suit)
    pub min_distribution: Distribution,
    /// Minimum HCP partner has shown, if any
    pub min_hcp: Option<u8>,
    /// Maximum HCP partner has shown, if any
    pub max_hcp: Option<u8>,
}

impl PartnerModel {
    /// Infer partner's profile from the auction
    ///
    /// Analyzes all of partner's calls to build a profile of their hand.
    pub fn from_auction(auction: &Auction, our_position: Position) -> Self {
        let partner_position = our_position.partner();

        // Start with no information
        let mut model = Self::default();

        // Empty auction - partner hasn't bid yet
        if auction.calls.is_empty() {
            return model;
        }

        // Determine which calls are partner's
        for (current_pos, call) in auction.iter() {
            if current_pos == partner_position {
                model = update_model_from_call(&model, call);
            }
        }

        model
    }

    pub fn has_shown_suit(&self, suit: Suit) -> bool {
        self.min_distribution.length(suit) > 0
    }

    pub fn shown_suits(&self) -> Vec<Suit> {
        Suit::ALL
            .iter()
            .filter(|&&suit| self.min_distribution.length(suit) > 0)
            .copied()
            .collect()
    }

    /// Calculate combined minimum points with our hand
    pub fn combined_min_points(&self, our_hcp: u8) -> u8 {
        our_hcp + self.min_hcp.unwrap_or(0)
    }

    pub fn min_length(&self, suit: Suit) -> u8 {
        self.min_distribution.length(suit)
    }
}

/// Update the partner model based on a single call
fn update_model_from_call(model: &PartnerModel, call: &Call) -> PartnerModel {
    match call {
        Call::Pass | Call::Double | Call::Redouble => {
            // These don't convey specific hand information in NBK
            model.clone()
        }
        Call::Bid { level, strain } => update_model_from_bid(model, *level, *strain),
    }
}

/// Update the partner model based on a bid
fn update_model_from_bid(model: &PartnerModel, level: u8, strain: Strain) -> PartnerModel {
    let mut new_model = model.clone();

    match strain {
        // Notrump bids
        Strain::NoTrump => {
            match level {
                1 => {
                    // 1NT = 15-17 HCP, balanced
                    new_model.min_hcp = Some(update_min(model.min_hcp, 15));
                    new_model.max_hcp = Some(update_max(model.max_hcp, 17));
                }
                2 => {
                    // 2NT = 20-21 HCP, balanced
                    new_model.min_hcp = Some(update_min(model.min_hcp, 20));
                    new_model.max_hcp = Some(update_max(model.max_hcp, 21));
                }
                3 => {
                    // 3NT = 25-27 HCP (or game bid based on fit)
                    new_model.min_hcp = Some(update_min(model.min_hcp, 25));
                }
                _ => {
                    // Other NT bids - assume strong hand
                    new_model.min_hcp = Some(update_min(model.min_hcp, 13));
                }
            }
        }

        // Suit bids
        Strain::Clubs | Strain::Diamonds | Strain::Hearts | Strain::Spades => {
            let suit = match strain {
                Strain::Clubs => Suit::Clubs,
                Strain::Diamonds => Suit::Diamonds,
                Strain::Hearts => Suit::Hearts,
                Strain::Spades => Suit::Spades,
                _ => unreachable!(),
            };

            // Update suit length
            let current_min = new_model.min_distribution.length(suit);

            // Opening bids at 1-level show 4+ cards
            if level == 1 {
                new_model
                    .min_distribution
                    .set_length(suit, current_min.max(4));
                // Opening bids show 13+ HCP
                new_model.min_hcp = Some(update_min(model.min_hcp, 13));
            }
            // 2-level bids typically show 5+ cards
            else if level == 2 {
                new_model
                    .min_distribution
                    .set_length(suit, current_min.max(5));
                new_model.min_hcp = Some(update_min(model.min_hcp, 13));
            }
            // 3-level and higher typically show 6+ cards
            else {
                new_model
                    .min_distribution
                    .set_length(suit, current_min.max(6));
                new_model.min_hcp = Some(update_min(model.min_hcp, 13));
            }
        }
    }

    new_model
}

/// Update minimum value, taking the maximum of current and new
fn update_min(current: Option<u8>, new: u8) -> u8 {
    current.map(|c| c.max(new)).unwrap_or(new)
}

/// Update maximum value, taking the minimum of current and new
fn update_max(current: Option<u8>, new: u8) -> u8 {
    current.map(|c| c.min(new)).unwrap_or(new)
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let model = PartnerModel::from_auction(&auction, Position::South);

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
        let model = PartnerModel::from_auction(&auction, Position::South);

        assert_eq!(model.min_hcp, Some(15));
        assert_eq!(model.max_hcp, Some(17));
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
        let model = PartnerModel::from_auction(&auction, Position::South);

        assert_eq!(model.min_hcp, Some(13));
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
        let model = PartnerModel::from_auction(&auction, Position::South);
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
        let model = PartnerModel::from_auction(&auction, Position::South);

        assert_eq!(model.min_length(Suit::Diamonds), 5);
        assert_eq!(model.min_hcp, Some(13));
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
        let model = PartnerModel::from_auction(&auction, Position::North);
        // North's own bid shouldn't appear in their partner model
        assert!(!model.has_shown_suit(Suit::Clubs));
    }
}
