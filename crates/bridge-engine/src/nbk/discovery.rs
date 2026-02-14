//! Discovery Protocol: Show new 4+ card suits (forcing)

use crate::nbk::{point_ranges::PointRanges, HandModel, PartnerModel};
use bridge_core::{Call, Strain, Suit};

/// Discovery Protocol implementation
pub struct DiscoveryProtocol;

impl DiscoveryProtocol {
    /// Find all valid discovery bids
    ///
    /// Discovery bids show a new 4+ card suit that partner hasn't shown.
    /// These bids are forcing.
    ///
    /// Returns all valid discovery bids. Priority ordering is handled by BidSelector.
    pub fn valid_discovery_bids(
        hand_model: &HandModel,
        partner_model: &PartnerModel,
        legal_calls: &[Call],
    ) -> Vec<Call> {
        let mut discovery_bids = Vec::new();
        let combined_hcp = partner_model.combined_min_points(hand_model.hcp);

        // Check each suit
        for suit in Suit::ALL {
            // Must have 4+ cards
            if hand_model.length(suit) < 4 {
                continue;
            }

            // Must not be partner's suit
            if partner_model.has_shown_suit(suit) {
                continue;
            }

            // Find the cheapest legal bid in this suit
            let strain = suit_to_strain(suit);
            if let Some(call) = find_cheapest_bid_in_strain(legal_calls, strain) {
                // Check if we have enough points for this level
                if let Call::Bid { level, .. } = call {
                    let min_points = PointRanges::min_points_for_suited_bid(level);
                    if combined_hcp >= min_points {
                        discovery_bids.push(call);
                    }
                }
            }
        }

        discovery_bids
    }
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

/// Find the cheapest legal bid in a given strain
fn find_cheapest_bid_in_strain(legal_calls: &[Call], strain: Strain) -> Option<Call> {
    legal_calls
        .iter()
        .filter(|call| matches!(call, Call::Bid { strain: s, .. } if *s == strain))
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
    use bridge_core::Shape;

    #[test]
    fn test_no_discovery_without_4_cards() {
        // Hand has 3-3-3-4 distribution
        let hand_model = HandModel {
            hcp: 12,
            distribution: Distribution {
                clubs: 4,
                diamonds: 3,
                hearts: 3,
                spades: 3,
            }, // 4 clubs, 3 others
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_distribution: Distribution::default(),
            min_hcp: Some(13),
            max_hcp: None,
        };

        // Legal calls at 1-level
        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 1,
                strain: Strain::Diamonds,
            },
            Call::Bid {
                level: 1,
                strain: Strain::Hearts,
            },
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            },
        ];

        let bids =
            DiscoveryProtocol::valid_discovery_bids(&hand_model, &partner_model, &legal_calls);

        // Should only find 1C (the only 4+ suit)
        assert_eq!(bids.len(), 0); // 1C is not in legal_calls
    }

    #[test]
    fn test_discovery_finds_4_card_suits() {
        // Hand has 4-4-3-2 distribution
        let hand_model = HandModel {
            hcp: 10,
            distribution: Distribution {
                clubs: 2,
                diamonds: 3,
                hearts: 4,
                spades: 4,
            }, // 4 hearts, 4 spades
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_distribution: Distribution::default(),
            min_hcp: Some(13),
            max_hcp: None,
        };

        // Legal calls
        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 1,
                strain: Strain::Hearts,
            },
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            },
        ];

        let bids =
            DiscoveryProtocol::valid_discovery_bids(&hand_model, &partner_model, &legal_calls);

        // Should find both 1H and 1S (23 combined HCP > 16)
        assert_eq!(bids.len(), 2);
        assert!(bids.contains(&Call::Bid {
            level: 1,
            strain: Strain::Hearts
        }));
        assert!(bids.contains(&Call::Bid {
            level: 1,
            strain: Strain::Spades
        }));
    }

    #[test]
    fn test_discovery_excludes_partner_suits() {
        // Hand has 4 spades
        let hand_model = HandModel {
            hcp: 10,
            distribution: Distribution {
                clubs: 2,
                diamonds: 3,
                hearts: 4,
                spades: 4,
            }, // 4 hearts, 4 spades
            shape: Shape::Balanced,
        };
        // Partner opened 1H
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
                level: 1,
                strain: Strain::Hearts,
            },
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            },
        ];

        let bids =
            DiscoveryProtocol::valid_discovery_bids(&hand_model, &partner_model, &legal_calls);

        // Should only find 1S (not 1H, since partner showed hearts)
        assert_eq!(bids.len(), 1);
        assert!(bids.contains(&Call::Bid {
            level: 1,
            strain: Strain::Spades
        }));
    }

    #[test]
    fn test_discovery_checks_point_requirements() {
        // Hand has 4 spades but only 5 HCP
        let hand_model = HandModel {
            hcp: 5,
            distribution: Distribution {
                clubs: 2,
                diamonds: 3,
                hearts: 4,
                spades: 4,
            }, // 4 hearts, 4 spades
            shape: Shape::Balanced,
        };
        // Partner has 10 HCP (total 15, need 16 for 1-level)
        let partner_model = PartnerModel {
            min_distribution: Distribution::default(),
            min_hcp: Some(10),
            max_hcp: None,
        };

        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            },
        ];

        let bids =
            DiscoveryProtocol::valid_discovery_bids(&hand_model, &partner_model, &legal_calls);

        // Should not find any bids (15 HCP < 16 required)
        assert_eq!(bids.len(), 0);
    }

    #[test]
    fn test_discovery_with_sufficient_points() {
        // Hand has 4 spades and 7 HCP
        let hand_model = HandModel {
            hcp: 7,
            distribution: Distribution {
                clubs: 2,
                diamonds: 3,
                hearts: 4,
                spades: 4,
            }, // 4 hearts, 4 spades
            shape: Shape::Balanced,
        };
        // Partner has 10 HCP (total 17, enough for 1-level)
        let partner_model = PartnerModel {
            min_distribution: Distribution::default(),
            min_hcp: Some(10),
            max_hcp: None,
        };

        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 1,
                strain: Strain::Hearts,
            },
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            },
        ];

        let bids =
            DiscoveryProtocol::valid_discovery_bids(&hand_model, &partner_model, &legal_calls);

        // Should find both (17 HCP >= 16 required)
        assert_eq!(bids.len(), 2);
    }
}
