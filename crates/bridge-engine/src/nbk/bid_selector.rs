//! Bid selection with priority resolution

use crate::nbk::{
    discovery::DiscoveryProtocol, limit::LimitProtocol, AuctionModel, HandModel, PartnerModel,
};
use bridge_core::{Call, Strain, Suit};

/// Bid selector implementing the NBK priority stack
pub struct BidSelector;

impl BidSelector {
    /// Select the best bid according to NBK priority rules
    ///
    /// Priority stack (NBK Section 5):
    /// 1. Primary: Support majors (if 8+ card major fit exists)
    /// 2. Secondary: Show major length (discovery)
    /// 3. Tertiary: Show strength (NT, minor discovery, rebid)
    /// 4. Fallback: Pass (if not forcing)
    pub fn select_best_bid(
        hand_model: &HandModel,
        partner_model: &PartnerModel,
        auction_model: &AuctionModel,
        legal_calls: &[Call],
    ) -> Call {
        // Get all valid bids from protocols
        let discovery_bids =
            DiscoveryProtocol::valid_discovery_bids(hand_model, partner_model, legal_calls);
        let limit_bids = LimitProtocol::valid_limit_bids(hand_model, partner_model, legal_calls);

        // 1. PRIMARY: Support majors (Limit Protocol)
        if let Some(bid) = find_major_support(&limit_bids) {
            return bid;
        }

        // 2. SECONDARY: Show major length (Discovery Protocol)
        if let Some(bid) = select_best_discovery_bid(&discovery_bids, hand_model, true) {
            return bid;
        }

        // 3. TERTIARY: Show strength
        // Try NT limit first
        if let Some(bid) = find_nt_bid(&limit_bids) {
            return bid;
        }

        // Try minor discovery
        if let Some(bid) = select_best_discovery_bid(&discovery_bids, hand_model, false) {
            return bid;
        }

        // Try rebid limit
        if let Some(bid) = find_suit_rebid(&limit_bids) {
            return bid;
        }

        // 4. FALLBACK: Pass (unless forcing)
        if auction_model.is_forcing {
            // If forcing, must bid something - pick cheapest legal bid
            // (This is a safety fallback - normally protocols should provide a bid)
            legal_calls
                .iter()
                .filter(|c| matches!(c, Call::Bid { .. }))
                .min_by_key(|call| {
                    if let Call::Bid { level, .. } = call {
                        *level
                    } else {
                        u8::MAX
                    }
                })
                .copied()
                .unwrap_or(Call::Pass)
        } else {
            Call::Pass
        }
    }
}

/// Find major suit support bids (hearts or spades)
fn find_major_support(limit_bids: &[Call]) -> Option<Call> {
    limit_bids
        .iter()
        .find(|call| {
            matches!(
                call,
                Call::Bid {
                    strain: Strain::Hearts | Strain::Spades,
                    ..
                }
            )
        })
        .copied()
}

/// Find NT bids
fn find_nt_bid(limit_bids: &[Call]) -> Option<Call> {
    limit_bids
        .iter()
        .find(|call| {
            matches!(
                call,
                Call::Bid {
                    strain: Strain::NoTrump,
                    ..
                }
            )
        })
        .copied()
}

/// Find suit rebid bids (non-major, non-NT)
fn find_suit_rebid(limit_bids: &[Call]) -> Option<Call> {
    limit_bids
        .iter()
        .find(|call| {
            matches!(
                call,
                Call::Bid {
                    strain: Strain::Clubs | Strain::Diamonds,
                    ..
                }
            )
        })
        .copied()
}

/// Select the best discovery bid using NBK priority rules
///
/// Priority (per user feedback - this logic belongs in BidSelector, not Discovery Protocol):
/// 1. Longest suit first
/// 2. If tied at 5-5 (or longer): bid higher-ranking suit
/// 3. If tied at 4-4: bid lower-ranking suit (up-the-line)
///
/// If `majors_only` is true, only consider major suits.
fn select_best_discovery_bid(
    discovery_bids: &[Call],
    hand_model: &HandModel,
    majors_only: bool,
) -> Option<Call> {
    let candidates: Vec<Call> = discovery_bids
        .iter()
        .filter(|call| {
            if majors_only {
                matches!(
                    call,
                    Call::Bid {
                        strain: Strain::Hearts | Strain::Spades,
                        ..
                    }
                )
            } else {
                matches!(
                    call,
                    Call::Bid {
                        strain: Strain::Clubs | Strain::Diamonds,
                        ..
                    }
                )
            }
        })
        .copied()
        .collect();

    if candidates.is_empty() {
        return None;
    }

    // Find lengths of each candidate suit
    let mut lengths_and_bids: Vec<(u8, Call)> = candidates
        .iter()
        .map(|call| {
            if let Call::Bid { strain, .. } = call {
                let suit = strain_to_suit(*strain);
                let length = hand_model.length(suit);
                (length, *call)
            } else {
                (0, *call)
            }
        })
        .collect();

    // Find the maximum length
    let max_length = lengths_and_bids
        .iter()
        .map(|(len, _)| *len)
        .max()
        .unwrap_or(0);

    // Filter to only suits with max length
    lengths_and_bids.retain(|(len, _)| *len == max_length);

    if lengths_and_bids.len() == 1 {
        return Some(lengths_and_bids[0].1);
    }

    // Multiple suits with same length - apply tiebreaker
    if max_length >= 5 {
        // 5-5 or longer: bid higher-ranking suit
        lengths_and_bids.sort_by_key(|(_, call)| {
            if let Call::Bid { strain, .. } = call {
                suit_rank(*strain)
            } else {
                0
            }
        });
        lengths_and_bids.last().map(|(_, call)| *call)
    } else {
        // 4-4: bid lower-ranking suit (up-the-line)
        lengths_and_bids.sort_by_key(|(_, call)| {
            if let Call::Bid { strain, .. } = call {
                suit_rank(*strain)
            } else {
                u8::MAX
            }
        });
        lengths_and_bids.first().map(|(_, call)| *call)
    }
}

/// Convert Strain to Suit (panics for NoTrump)
fn strain_to_suit(strain: Strain) -> Suit {
    match strain {
        Strain::Clubs => Suit::Clubs,
        Strain::Diamonds => Suit::Diamonds,
        Strain::Hearts => Suit::Hearts,
        Strain::Spades => Suit::Spades,
        Strain::NoTrump => panic!("Cannot convert NoTrump to Suit"),
    }
}

/// Get suit rank (Clubs=0, Diamonds=1, Hearts=2, Spades=3)
fn suit_rank(strain: Strain) -> u8 {
    match strain {
        Strain::Clubs => 0,
        Strain::Diamonds => 1,
        Strain::Hearts => 2,
        Strain::Spades => 3,
        Strain::NoTrump => 4,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_core::Distribution;
    use bridge_core::Shape;

    #[test]
    fn test_major_support_priority() {
        // Partner opened 1H, we have support
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
        let auction_model = AuctionModel { is_forcing: false };
        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            },
            Call::Bid {
                level: 2,
                strain: Strain::Hearts,
            },
        ];

        let bid =
            BidSelector::select_best_bid(&hand_model, &partner_model, &auction_model, &legal_calls);

        // Should prioritize 2H (major support) over 1S (discovery)
        assert_eq!(
            bid,
            Call::Bid {
                level: 2,
                strain: Strain::Hearts
            }
        );
    }

    #[test]
    fn test_discovery_44_up_the_line() {
        // 4-4 in majors, no fit
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
            min_hcp: Some(10),
            max_hcp: None,
        };
        let auction_model = AuctionModel { is_forcing: false };
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

        let bid =
            BidSelector::select_best_bid(&hand_model, &partner_model, &auction_model, &legal_calls);

        // Should bid 1H (lower-ranking, up-the-line) not 1S
        assert_eq!(
            bid,
            Call::Bid {
                level: 1,
                strain: Strain::Hearts
            }
        );
    }

    #[test]
    fn test_discovery_55_higher_rank() {
        // 5-5 in majors
        let hand_model = HandModel {
            hcp: 10,
            distribution: Distribution {
                clubs: 1,
                diamonds: 2,
                hearts: 5,
                spades: 5,
            }, // 5 hearts, 5 spades
            shape: Shape::SemiBalanced,
        };
        let partner_model = PartnerModel {
            min_distribution: Distribution::default(),
            min_hcp: Some(10),
            max_hcp: None,
        };
        let auction_model = AuctionModel { is_forcing: false };
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

        let bid =
            BidSelector::select_best_bid(&hand_model, &partner_model, &auction_model, &legal_calls);

        // Should bid 1S (higher-ranking) not 1H
        assert_eq!(
            bid,
            Call::Bid {
                level: 1,
                strain: Strain::Spades
            }
        );
    }

    #[test]
    fn test_nt_when_balanced() {
        // Balanced, no fit, no 4-card major
        let hand_model = HandModel {
            hcp: 12,
            distribution: Distribution {
                clubs: 3,
                diamonds: 3,
                hearts: 3,
                spades: 4,
            }, // 4 spades, balanced
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_distribution: Distribution {
                clubs: 4,
                ..Distribution::default()
            }, // Partner opened 1C
            min_hcp: Some(13),
            max_hcp: None,
        };
        let auction_model = AuctionModel { is_forcing: false };
        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 2,
                strain: Strain::NoTrump,
            },
            Call::Bid {
                level: 3,
                strain: Strain::NoTrump,
            },
        ];

        let bid =
            BidSelector::select_best_bid(&hand_model, &partner_model, &auction_model, &legal_calls);

        // Should bid 3NT (balanced, 25 HCP = game)
        assert_eq!(
            bid,
            Call::Bid {
                level: 3,
                strain: Strain::NoTrump
            }
        );
    }

    #[test]
    fn test_pass_when_weak() {
        // Weak hand, no fit
        let hand_model = HandModel {
            hcp: 5,
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
                clubs: 4,
                ..Distribution::default()
            }, // Partner opened 1C
            min_hcp: Some(13),
            max_hcp: None,
        };
        let auction_model = AuctionModel { is_forcing: false };
        let legal_calls = vec![
            Call::Pass,
            Call::Bid {
                level: 1,
                strain: Strain::Diamonds,
            },
        ];

        let bid =
            BidSelector::select_best_bid(&hand_model, &partner_model, &auction_model, &legal_calls);

        // Should pass (only 18 HCP combined, not enough for 1-level at 16)
        // Actually wait, 5 + 13 = 18, which is >= 16, so should bid 1D...
        // But we only have 3 diamonds, need 4 for discovery
        assert_eq!(bid, Call::Pass);
    }
}
