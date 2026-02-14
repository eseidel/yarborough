//! Limit Protocol: Define hand strength in known fits or NT (non-forcing)

use crate::nbk::{point_ranges::PointRanges, HandConstraint, PartnerModel};
use bridge_core::{Call, Shape, Strain, Suit};

/// Limit Protocol implementation
pub struct LimitProtocol;

impl LimitProtocol {
    /// Get the hand constraints required for a call to be a valid limit bid
    pub fn get_constraints(
        partner_model: &PartnerModel,
        call: &Call,
    ) -> Option<Vec<HandConstraint>> {
        let (level, strain) = match call {
            Call::Bid { level, strain } => (*level, *strain),
            _ => return None,
        };

        if strain == Strain::NoTrump {
            return get_notrump_constraints(partner_model, level);
        }

        let suit = strain.to_suit()?;

        // Try support raise
        if let Some(constraints) = get_support_constraints(partner_model, level, suit) {
            return Some(constraints);
        }

        // Try rebid
        if let Some(constraints) = get_rebid_constraints(partner_model, level, suit) {
            return Some(constraints);
        }

        None
    }
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
    partner_model: &PartnerModel,
    level: u8,
    suit: Suit,
) -> Option<Vec<HandConstraint>> {
    // Rebid own 6+ suit (not partner's)
    if partner_model.has_shown_suit(suit) {
        return None;
    }

    let mut constraints = vec![HandConstraint::MinLength(suit, 6)];
    constraints.extend(PointRanges::for_suited_bid(level, partner_model));
    Some(constraints)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nbk::HandModel;
    use bridge_core::Distribution;

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

        let constraints = LimitProtocol::get_constraints(&partner_model, &call).unwrap();

        // Should find 2H (21 HCP, < 22 for level 3, >= 19 for level 2, with 13 from partner)
        assert!(hand_model.satisfies_all(constraints));
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

        let constraints = LimitProtocol::get_constraints(&partner_model, &call).unwrap();

        // Should find 4S (26 HCP >= 25 for game)
        assert!(hand_model.satisfies_all(constraints));
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

        let constraints = LimitProtocol::get_constraints(&partner_model, &call).unwrap();

        // Should find 2NT (22 HCP)
        assert!(hand_model.satisfies_all(constraints));
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

        let constraints = LimitProtocol::get_constraints(&partner_model, &call).unwrap();

        // Should find 3NT (26 HCP >= 25 for game)
        assert!(hand_model.satisfies_all(constraints));
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

        let constraints = LimitProtocol::get_constraints(&partner_model, &call).unwrap();

        // Should find 2S (20 HCP >= 19 for level 2)
        assert!(hand_model.satisfies_all(constraints));
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

        let constraints = LimitProtocol::get_constraints(&partner_model, &nt_call).unwrap();

        // Should be found but NOT satisfied
        assert!(!hand_model.satisfies_all(constraints));
    }
}
