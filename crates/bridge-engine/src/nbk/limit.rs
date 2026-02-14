//! Limit Protocol: Define hand strength in known fits or NT (non-forcing)

use crate::nbk::{point_ranges::PointRanges, HandModel, PartnerModel};
use bridge_core::{Call, Shape, Strain, Suit};

/// Limit Protocol implementation
pub struct LimitProtocol;

impl LimitProtocol {
    /// Find all valid limit bids
    ///
    /// Limit bids define hand strength by:
    /// - Supporting partner's suit (requires 8+ card fit)
    /// - Bidding NT (requires balanced/semi-balanced shape)
    /// - Rebidding own 6+ card suit
    pub fn valid_limit_bids(
        hand_model: &HandModel,
        partner_model: &PartnerModel,
        legal_calls: &[Call],
    ) -> Vec<Call> {
        let mut limit_bids = Vec::new();

        // Try each sub-protocol
        limit_bids.extend(support_limit_bids(hand_model, partner_model, legal_calls));
        limit_bids.extend(notrump_limit_bids(hand_model, partner_model, legal_calls));
        limit_bids.extend(rebid_limit_bids(hand_model, partner_model, legal_calls));

        limit_bids
    }
}

/// Support Limit: Raise partner's suit (requires 8+ card fit)
fn support_limit_bids(
    hand_model: &HandModel,
    partner_model: &PartnerModel,
    legal_calls: &[Call],
) -> Vec<Call> {
    let mut bids = Vec::new();
    let combined_hcp = partner_model.combined_min_points(hand_model.hcp);

    // Check each suit partner has shown
    for suit in partner_model.shown_suits() {
        let our_length = hand_model.length(suit);
        let partner_min_length = partner_model.min_length(suit);

        // Need 8+ card fit
        if our_length + partner_min_length < 8 {
            continue;
        }

        let strain = suit_to_strain(suit);
        let is_major = matches!(suit, Suit::Hearts | Suit::Spades);

        // Determine target level based on combined points
        // NBK zones: < 25 = Partscore, 25+ = Game
        let target_level = if combined_hcp >= 25 {
            // Game zone: bid game
            if is_major {
                4 // 4H or 4S
            } else {
                5 // 5C or 5D
            }
        } else {
            // Partscore: simple raise to 2
            2
        };

        // Find this bid in legal calls
        if let Some(call) = find_bid_at_level(legal_calls, strain, target_level) {
            bids.push(call);
        }
    }

    bids
}

/// NoTrump Limit: Bid NT if balanced/semi-balanced and no fit
fn notrump_limit_bids(
    hand_model: &HandModel,
    partner_model: &PartnerModel,
    legal_calls: &[Call],
) -> Vec<Call> {
    let mut bids = Vec::new();

    // Must be balanced or semi-balanced
    if !matches!(hand_model.shape, Shape::Balanced | Shape::SemiBalanced) {
        return bids;
    }

    let combined_hcp = partner_model.combined_min_points(hand_model.hcp);

    // Determine target NT level based on combined points
    // NBK zones: < 25 = Partscore, 25+ = Game
    let target_level = if combined_hcp >= 25 {
        3 // 3NT game
    } else if combined_hcp >= 22 {
        2 // 2NT (high partscore)
    } else if combined_hcp >= 19 {
        1 // 1NT
    } else {
        return bids; // Not enough for any NT bid
    };

    // Find this bid in legal calls
    if let Some(call) = find_bid_at_level(legal_calls, Strain::NoTrump, target_level) {
        // Check if we have minimum points for this level
        let min_points = PointRanges::min_points_for_nt_bid(target_level);
        if combined_hcp >= min_points {
            bids.push(call);
        }
    }

    bids
}

/// Rebid Limit: Rebid own 6+ card suit
fn rebid_limit_bids(
    hand_model: &HandModel,
    partner_model: &PartnerModel,
    legal_calls: &[Call],
) -> Vec<Call> {
    let mut bids = Vec::new();
    let combined_hcp = partner_model.combined_min_points(hand_model.hcp);

    // Find our longest suit with 6+ cards
    for suit in Suit::ALL {
        if hand_model.length(suit) < 6 {
            continue;
        }

        let strain = suit_to_strain(suit);

        // Determine target level based on combined points
        // NBK zones: < 25 = Partscore, 25+ = Game
        let min_level = if combined_hcp >= 25 {
            // Game zone: 4-level or 5-level
            4
        } else {
            // Partscore: rebid at 2
            2
        };

        // Find the cheapest legal bid at or above min_level
        if let Some(call) = find_bid_at_or_above_level(legal_calls, strain, min_level) {
            if let Call::Bid { level, .. } = call {
                let min_points = PointRanges::min_points_for_suited_bid(level);
                if combined_hcp >= min_points {
                    bids.push(call);
                }
            }
        }
    }

    bids
}

/// Convert Suit to Strain
fn suit_to_strain(suit: Suit) -> Strain {
    match suit {
        Suit::Clubs => Strain::Clubs,
        Suit::Diamonds => Strain::Diamonds,
        Suit::Hearts => Strain::Hearts,
        Suit::Spades => Strain::Spades,
    }
}

/// Find a bid at exactly the specified level and strain
fn find_bid_at_level(legal_calls: &[Call], strain: Strain, level: u8) -> Option<Call> {
    legal_calls
        .iter()
        .find(
            |call| matches!(call, Call::Bid { level: l, strain: s } if *l == level && *s == strain),
        )
        .copied()
}

/// Find the cheapest bid at or above the specified level in the strain
fn find_bid_at_or_above_level(legal_calls: &[Call], strain: Strain, min_level: u8) -> Option<Call> {
    legal_calls
        .iter()
        .filter(|call| matches!(call, Call::Bid { level: l, strain: s } if *l >= min_level && *s == strain))
        .min_by_key(|call| {
            if let Call::Bid { level, .. } = call {
                *level
            } else {
                u8::MAX
            }
        })
        .copied()
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_core::Distribution;

    #[test]
    fn test_support_limit_with_fit() {
        // Partner opened 1H, we have 4 hearts
        let hand_model = HandModel {
            hcp: 10,
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
            max_hcp: None,
        };

        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 2,
                strain: Strain::Hearts,
            },
            Call::Bid {
                level: 3,
                strain: Strain::Hearts,
            },
        ];

        let bids = LimitProtocol::valid_limit_bids(&hand_model, &partner_model, &legal_calls);

        // Should find 2H (23 HCP, < 25 for game, >= 16 for level 2)
        assert!(bids.contains(&Call::Bid {
            level: 2,
            strain: Strain::Hearts
        }));
    }

    #[test]
    fn test_support_limit_game() {
        // Partner opened 1S, we have 3 spades and 13 HCP
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
            max_hcp: None,
        };

        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 2,
                strain: Strain::Spades,
            },
            Call::Bid {
                level: 4,
                strain: Strain::Spades,
            },
        ];

        let bids = LimitProtocol::valid_limit_bids(&hand_model, &partner_model, &legal_calls);

        // Should find 4S (26 HCP >= 25 for game)
        assert!(bids.contains(&Call::Bid {
            level: 4,
            strain: Strain::Spades
        }));
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
            min_distribution: Distribution::default(),
            min_hcp: Some(10),
            max_hcp: None,
        };

        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 1,
                strain: Strain::NoTrump,
            },
            Call::Bid {
                level: 2,
                strain: Strain::NoTrump,
            },
        ];

        let bids = LimitProtocol::valid_limit_bids(&hand_model, &partner_model, &legal_calls);

        // Should find 2NT (22 HCP)
        assert!(bids.contains(&Call::Bid {
            level: 2,
            strain: Strain::NoTrump
        }));
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
            min_distribution: Distribution::default(),
            min_hcp: Some(13),
            max_hcp: None,
        };

        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 3,
                strain: Strain::NoTrump,
            },
        ];

        let bids = LimitProtocol::valid_limit_bids(&hand_model, &partner_model, &legal_calls);

        // Should find 3NT (26 HCP >= 25 for game)
        assert!(bids.contains(&Call::Bid {
            level: 3,
            strain: Strain::NoTrump
        }));
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
            min_distribution: Distribution::default(),
            min_hcp: Some(10),
            max_hcp: None,
        };

        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 2,
                strain: Strain::Spades,
            },
        ];

        let bids = LimitProtocol::valid_limit_bids(&hand_model, &partner_model, &legal_calls);

        // Should find 2S (20 HCP >= 19 for level 2)
        assert!(bids.contains(&Call::Bid {
            level: 2,
            strain: Strain::Spades
        }));
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
            max_hcp: None,
        };

        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 2,
                strain: Strain::NoTrump,
            },
        ];

        let bids = LimitProtocol::valid_limit_bids(&hand_model, &partner_model, &legal_calls);

        // Should not find NT (unbalanced) or support (no fit) or rebid (no 6+ suit)
        assert_eq!(bids.len(), 0);
    }
}
