//! Limit Protocol: Define hand strength in known fits or NT (non-forcing)

use crate::nbk::{
    AuctionModel, CallPurpose, CallSemantics, HandConstraint, PartnerModel, PointRanges,
};
use bridge_core::{Call, Shape, Strain, Suit};

/// Limit Protocol implementation
pub struct LimitProtocol;

impl LimitProtocol {
    /// Get the hand constraints required for a call to be a valid limit bid
    pub fn get_semantics(auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        let (level, strain) = match call {
            Call::Bid { level, strain } => (*level, *strain),
            Call::Pass => return get_pass_semantics(auction_model),
            _ => return None,
        };

        let constraints = if strain == Strain::NoTrump {
            get_notrump_constraints(&auction_model.partner_model, level)?
        } else {
            let suit = strain.to_suit()?;

            // Try support raise
            if let Some(constraints) =
                get_support_constraints(&auction_model.partner_model, level, suit)
            {
                constraints
            } else if let Some(constraints) = get_rebid_constraints(auction_model, level, suit) {
                // Try rebid
                constraints
            } else {
                return None;
            }
        };

        Some(CallSemantics {
            purpose: CallPurpose::Limit,
            shows: constraints,
        })
    }
}

fn get_pass_semantics(auction_model: &AuctionModel) -> Option<CallSemantics> {
    // Only applies if we have some information about partner's maximum.
    let partner_max_hcp = auction_model.partner_model.max_hcp?;

    let our_partnership = auction_model.auction.current_partnership();
    let contract = auction_model
        .auction
        .current_contract()
        .filter(|c| c.belongs_to(our_partnership))?;

    // TODO: What are the pass semantics when contract belongs to the other partnership?

    if contract.is_grand_slam() {
        return None;
    }

    let goal = if contract.is_slam() {
        PointRanges::GRAND_SLAM_THRESHOLD
    } else if contract.is_game() {
        PointRanges::SLAM_THRESHOLD
    } else {
        PointRanges::GAME_THRESHOLD
    };

    // Impossibility threshold: our_hcp + partner_max < goal
    // our_hcp <= (goal - 1) - partner_max
    let threshold = (goal - 1).saturating_sub(partner_max_hcp);

    Some(CallSemantics {
        purpose: CallPurpose::Limit,
        shows: vec![HandConstraint::MaxHcp(threshold)],
    })
}

fn get_notrump_constraints(partner_model: &PartnerModel, level: u8) -> Option<Vec<HandConstraint>> {
    let mut constraints = vec![HandConstraint::MaxUnbalancedness(Shape::SemiBalanced)];
    constraints.extend(PointRanges::for_nt_bid(level, partner_model));
    Some(constraints)
}

fn get_support_constraints(
    partner_model: &PartnerModel,
    level: u8,
    suit: Suit,
) -> Option<Vec<HandConstraint>> {
    if !partner_model.has_shown_suit(suit) {
        return None;
    }

    let needed_len = partner_model.length_needed_to_reach_target(suit, 8);
    let mut constraints = vec![HandConstraint::MinLength(suit, needed_len)];
    constraints.extend(PointRanges::for_suited_bid(level, partner_model));
    Some(constraints)
}

fn get_rebid_constraints(
    auction_model: &AuctionModel,
    level: u8,
    suit: Suit,
) -> Option<Vec<HandConstraint>> {
    // Rebid own 6+ suit (already shown by us, not partner's)
    if auction_model.partner_model.has_shown_suit(suit)
        || !auction_model.bidder_model.has_shown_suit(suit)
    {
        return None;
    }

    let mut constraints = vec![HandConstraint::MinLength(suit, 6)];
    constraints.extend(PointRanges::for_suited_bid(
        level,
        &auction_model.partner_model,
    ));
    Some(constraints)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nbk::{HandModel, PartnerModel};
    use bridge_core::{Auction, Distribution, Position};

    #[test]
    fn test_support_limit_with_fit() {
        // Partner opened 1H, we have 4 hearts
        let hand_model = HandModel {
            hcp: 8,
            distribution: Distribution {
                clubs: 2,
                diamonds: 3,
                hearts: 4,
                spades: 4,
            }, // 4 hearts
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_distribution: Distribution {
                hearts: 4,
                ..Distribution::default()
            }, // Partner has 4+ hearts
            min_hcp: Some(13),
            ..Default::default()
        };

        let call = Call::Bid {
            level: 2,
            strain: Strain::Hearts,
        };

        let auction_model = AuctionModel {
            partner_model,
            ..AuctionModel::default()
        };

        let semantics = LimitProtocol::get_semantics(&auction_model, &call).unwrap();

        // Should find 2H (21 HCP, < 22 for level 3, >= 19 for level 2, with 13 from partner)
        assert!(hand_model.satisfies_all(semantics.shows));
    }

    #[test]
    fn test_support_limit_game() {
        // Partner opened 1S, we have 4 spades and 13 HCP
        let hand_model = HandModel {
            hcp: 13,
            distribution: Distribution {
                clubs: 3,
                diamonds: 3,
                hearts: 3,
                spades: 4,
            },
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_distribution: Distribution {
                spades: 4,
                ..Distribution::default()
            }, // Partner has 4+ spades
            min_hcp: Some(13),
            ..Default::default()
        };

        let call = Call::Bid {
            level: 4,
            strain: Strain::Spades,
        };

        let auction_model = AuctionModel {
            partner_model,
            ..AuctionModel::default()
        };

        let semantics = LimitProtocol::get_semantics(&auction_model, &call).unwrap();

        // Should find 4S (26 HCP >= 25 for game)
        assert!(hand_model.satisfies_all(semantics.shows));
    }

    #[test]
    fn test_notrump_limit_balanced() {
        // Balanced hand, 12 HCP
        let hand_model = HandModel {
            hcp: 12,
            distribution: Distribution {
                clubs: 3,
                diamonds: 3,
                hearts: 3,
                spades: 4,
            },
            shape: Shape::Balanced,
        };
        // Partner has 10 HCP (total 22)
        let partner_model = PartnerModel {
            min_hcp: Some(10),
            ..Default::default()
        };

        let call = Call::Bid {
            level: 2,
            strain: Strain::NoTrump,
        };

        let auction_model = AuctionModel {
            partner_model,
            ..AuctionModel::default()
        };

        let semantics = LimitProtocol::get_semantics(&auction_model, &call).unwrap();

        // Should find 2NT (22 HCP)
        assert!(hand_model.satisfies_all(semantics.shows));
    }

    #[test]
    fn test_notrump_limit_game() {
        // Balanced hand, 13 HCP
        let hand_model = HandModel {
            hcp: 13,
            distribution: Distribution {
                clubs: 3,
                diamonds: 3,
                hearts: 3,
                spades: 4,
            },
            shape: Shape::Balanced,
        };
        // Partner has 13 HCP (total 26)
        let partner_model = PartnerModel {
            min_hcp: Some(13),
            ..Default::default()
        };

        let call = Call::Bid {
            level: 3,
            strain: Strain::NoTrump,
        };

        let auction_model = AuctionModel {
            partner_model,
            ..AuctionModel::default()
        };

        let semantics = LimitProtocol::get_semantics(&auction_model, &call).unwrap();

        // Should find 3NT (26 HCP >= 25 for game)
        assert!(hand_model.satisfies_all(semantics.shows));
    }

    #[test]
    fn test_rebid_limit_6_card_suit() {
        // 6 card spade suit
        let hand_model = HandModel {
            hcp: 10,
            distribution: Distribution {
                clubs: 1,
                diamonds: 2,
                hearts: 4,
                spades: 6,
            }, // 6 spades
            shape: Shape::SemiBalanced,
        };
        let partner_model = PartnerModel {
            min_hcp: Some(10),
            ..Default::default()
        };

        let call = Call::Bid {
            level: 2,
            strain: Strain::Spades,
        };

        let bidder_model = PartnerModel {
            min_distribution: Distribution {
                spades: 4,
                ..Distribution::default()
            },
            ..PartnerModel::default()
        };

        let auction_model = AuctionModel {
            partner_model,
            bidder_model: bidder_model.clone(),
            ..AuctionModel::default()
        };

        let semantics = LimitProtocol::get_semantics(&auction_model, &call).unwrap();

        // Should find 2S (20 HCP >= 19 for level 2)
        assert!(hand_model.satisfies_all(semantics.shows));
    }

    #[test]
    fn test_no_limit_without_fit_or_nt_shape() {
        // Unbalanced, no 6+ suit, no fit
        let hand_model = HandModel {
            hcp: 10,
            distribution: Distribution {
                clubs: 1,
                diamonds: 2,
                hearts: 5,
                spades: 5,
            }, // 5-5-2-1
            shape: Shape::Unbalanced,
        };
        let partner_model = PartnerModel {
            min_distribution: Distribution {
                clubs: 4,
                ..Distribution::default()
            }, // Partner showed clubs, we only have 1
            min_hcp: Some(13),
            ..Default::default()
        };

        let nt_call = Call::Bid {
            level: 2,
            strain: Strain::NoTrump,
        };

        let auction_model = AuctionModel {
            partner_model,
            ..AuctionModel::default()
        };

        let semantics = LimitProtocol::get_semantics(&auction_model, &nt_call).unwrap();

        // Should be found but NOT satisfied
        assert!(!hand_model.satisfies_all(semantics.shows));
    }

    #[test]
    fn test_pass_limit_shows_remote_game() {
        // Partner has max 15 HCP. Game (25) is remote if we have <= 9.
        let partner_model = PartnerModel {
            max_hcp: Some(15),
            ..Default::default()
        };
        let mut auction = Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Spades,
        });
        auction.add_call(Call::Pass);
        let auction_model = AuctionModel {
            auction,
            partner_model,
            ..AuctionModel::default()
        };

        let semantics = LimitProtocol::get_semantics(&auction_model, &Call::Pass).unwrap();
        // Threshold = 24 - 15 = 9.
        assert_eq!(semantics.shows, vec![HandConstraint::MaxHcp(9)]);
    }

    #[test]
    fn test_pass_limit_shows_remote_slam() {
        // We are already in game (4S)
        let mut auction = Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 4,
            strain: Strain::Spades,
        });
        auction.add_call(Call::Pass); // East

        // Partner (North) has max 21 HCP. Slam (33) is remote if we have <= 11.
        let partner_model = PartnerModel {
            max_hcp: Some(21),
            ..Default::default()
        };
        let auction_model = AuctionModel {
            auction,
            partner_model,
            ..AuctionModel::default()
        };

        let semantics = LimitProtocol::get_semantics(&auction_model, &Call::Pass).unwrap();
        // Threshold = 32 - 21 = 11.
        assert_eq!(semantics.shows, vec![HandConstraint::MaxHcp(11)]);
    }
}
