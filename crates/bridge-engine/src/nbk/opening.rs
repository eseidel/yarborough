//! Opening Protocol: First bid of the auction
//!
//! Handles opening bids including:
//! - 1-level suit openings (Rule of 20)
//! - NT openings (15-17, 20-21)
//! - Strong 2C
//! - Weak Twos
//! - Pre-empts

use crate::nbk::{AuctionModel, CallPurpose, CallSemantics, HandConstraint};
use bridge_core::{Call, Shape, Strain};

/// Opening Protocol implementation
pub struct OpeningProtocol;

impl OpeningProtocol {
    /// Get the semantics for an opening bid (or pass before opening)
    pub fn get_semantics(auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        // Only applies if the auction is Call::Pass or if it's the first bid
        if auction_model.auction.is_open() {
            return None;
        }

        let seat = auction_model.auction.current_seat();

        match call {
            Call::Pass => Self::get_pass_semantics(seat),
            Call::Bid { level, strain } => Self::get_bid_semantics(*level, *strain, seat, call),
            _ => None,
        }
    }

    fn get_pass_semantics(_seat: u8) -> Option<CallSemantics> {
        // Pass shows we don't have an opening hand.
        // In 4th seat, it also implies we didn't satisfy Rule of 15.
        // For simplicity, we just say MaxHcp(12) generally, though Rule of 20 failures also pass.
        // To be precise, we refrain from "limiting" too much with Pass in opening protocol
        // other than "Not Opening".
        // But for the Selector to work, we need some constraint that true negative hands satisfy.

        Some(CallSemantics {
            purpose: CallPurpose::Limit,
            shows: vec![HandConstraint::MaxHcp(12)],
            rule_name: "Pass (Opening)".to_string(),
            description: "Hand does not meet requirements for an opening bid".to_string(),
        })
    }

    fn get_bid_semantics(
        level: u8,
        strain: Strain,
        seat: u8,
        call: &Call,
    ) -> Option<CallSemantics> {
        match (level, strain) {
            // 2C Strong
            (2, Strain::Clubs) => Some(CallSemantics {
                purpose: CallPurpose::Opening,
                shows: vec![HandConstraint::MinHcp(22)],
                rule_name: "Strong 2C Opening".to_string(),
                description: "Very strong hand (22+ HCP)".to_string(),
            }),

            // 1NT (15-17)
            (1, Strain::NoTrump) => Some(CallSemantics {
                purpose: CallPurpose::Opening,
                shows: vec![
                    HandConstraint::MinHcp(15),
                    HandConstraint::MaxHcp(17),
                    HandConstraint::MaxUnbalancedness(Shape::Balanced),
                ],
                rule_name: "1NT Opening".to_string(),
                description: "Balanced hand with 15-17 HCP".to_string(),
            }),

            // 2NT (20-21)
            (2, Strain::NoTrump) => Some(CallSemantics {
                purpose: CallPurpose::Opening,
                shows: vec![
                    HandConstraint::MinHcp(20),
                    HandConstraint::MaxHcp(21),
                    HandConstraint::MaxUnbalancedness(Shape::Balanced),
                ],
                rule_name: "2NT Opening".to_string(),
                description: "Balanced hand with 20-21 HCP".to_string(),
            }),

            // 1-level Suit Openings
            (1, _) => {
                let suit = strain.to_suit()?;
                let mut shows = Vec::new();

                // Length requirements
                if suit.is_major() {
                    shows.push(HandConstraint::MinLength(suit, 5));
                } else {
                    shows.push(HandConstraint::MinLength(suit, 4));
                }

                // 3rd/4th seat can use Rule of 20 logic primarily, maybe lighter?
                // 4th seat uses Rule of 15.
                if seat == 4 {
                    shows.push(HandConstraint::RuleOfFifteen);
                } else {
                    shows.push(HandConstraint::RuleOfTwenty);
                    shows.push(HandConstraint::MinHcp(12));
                }

                Some(CallSemantics {
                    purpose: CallPurpose::Opening,
                    shows,
                    rule_name: format!("1{} Opening", suit.to_char()),
                    description: format!("Opening bid showing 4+ cards in {:?}", suit),
                })
            }

            // Weak Twos (2D, 2H, 2S)
            (2, _) => {
                let suit = strain.to_suit()?;
                // Weak 2 not allowed in 4th seat usually (SAYC). Openings in 4th are sound.
                if seat == 4 {
                    return None;
                }

                Some(CallSemantics {
                    purpose: CallPurpose::Opening,
                    shows: vec![
                        HandConstraint::MinLength(suit, 6),
                        HandConstraint::MaxLength(suit, 6),
                        HandConstraint::MinHcp(5),
                        HandConstraint::MaxHcp(10),
                    ],
                    rule_name: format!("Weak 2{}", suit.to_char()),
                    description: format!("Weak opening bid showing 6 cards in {:?}", suit),
                })
            }

            // Pre-empts (3-level+)
            (l, _) if l >= 3 => {
                let suit = strain.to_suit()?;
                // 3NT is usually Gambling or 25-27, let's ignore 3NT opening for now as user only specified "No trump openings... according to SAYC". SAYC 3NT is Gambling? Or 25-27?
                // Standard is Gambling (solid minor).
                // User said "Pre-emptive openings at the three level... supported". Usually suits.

                if strain == Strain::NoTrump {
                    return None; // Simplify for now
                }

                Some(CallSemantics {
                    purpose: CallPurpose::Opening,
                    shows: vec![
                        HandConstraint::MinLength(suit, l + 4),
                        HandConstraint::MaxHcp(10),
                    ],
                    rule_name: format!("Preemptive {} Opening", call.render()),
                    description: format!(
                        "Preemptive opening bid showing {} cards in {:?}",
                        l + 4,
                        suit
                    ),
                })
            }

            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_core::{Call, Position, Suit};

    fn make_auction(calls: Vec<Call>) -> AuctionModel {
        let mut auction = bridge_core::Auction::new(Position::North);
        for c in calls {
            auction.add_call(c);
        }
        AuctionModel::from_auction(&auction, Position::North)
    }

    #[test]
    fn test_opening_1major() {
        let model = make_auction(vec![]);
        let call = Call::Bid {
            level: 1,
            strain: Strain::Spades,
        };
        let sem = OpeningProtocol::get_semantics(&model, &call).unwrap();

        assert_eq!(sem.purpose, CallPurpose::Opening);
        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 5)));
        assert!(sem.shows.contains(&HandConstraint::RuleOfTwenty));
    }
}
