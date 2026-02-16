use crate::dsl::planner::GenuinePlanner;
use crate::nbk::call_menu::{CallMenu, CallMenuItem};
use crate::nbk::trace::{BidTrace, SelectionStep};
use crate::nbk::AuctionModel;
use crate::nbk::HandConstraint;
use types::{Call, Hand, Suit};

/// Call selector implementing the NBK priority stack
pub struct CallSelector;

impl CallSelector {
    /// Select the best call according to NBK priority rules
    pub fn select_best_call(hand: &Hand, auction_model: &AuctionModel) -> Option<Call> {
        Self::select_best_call_with_trace(hand, auction_model).selected_call
    }

    /// Select the best call and return a detailed trace of the selection process
    pub fn select_best_call_with_trace(hand: &Hand, auction_model: &AuctionModel) -> BidTrace {
        let menu = CallMenu::from_auction_model(auction_model);
        let mut selection_steps = Vec::new();
        let mut selected_call = None;

        let genuine_planner = GenuinePlanner;

        for group in &menu.groups {
            let mut satisfied_in_group = Vec::new();

            for item in &group.items {
                let planner = item
                    .semantics
                    .planner
                    .as_ref()
                    .map(|p| p.as_ref())
                    .unwrap_or(&genuine_planner);

                let satisfied =
                    planner.applies(auction_model, hand, &item.call, &item.semantics.shows);

                let mut failed_constraints = Vec::new();
                if !satisfied {
                    for constraint in &item.semantics.shows {
                        if !constraint.check(hand) {
                            failed_constraints.push(*constraint);
                        }
                    }
                }

                selection_steps.push(SelectionStep {
                    group_name: group.name.clone(),
                    call: item.call,
                    semantics: item.semantics.clone(),
                    satisfied,
                    failed_constraints,
                });

                if satisfied {
                    satisfied_in_group.push(item.clone());
                }
            }

            if let Some(call) = select_best_from_group(&satisfied_in_group, hand) {
                selected_call = Some(call);
                break;
            }
        }

        BidTrace {
            auction_model: auction_model.clone(),
            menu,
            selection_steps,
            selected_call,
        }
    }
}

/// Select the best item from a group of satisfied items.
///
/// Consults suit-based selection first, then falls back to the lowest
/// (first) call in the group.
fn select_best_from_group(items: &[CallMenuItem], hand: &Hand) -> Option<Call> {
    select_by_longest_suit(items, hand).or_else(|| items.first().map(|item| item.call))
}

/// Select the call whose shown suit is longest in the hand.
///
/// Returns `None` if no items show a suit (e.g., all are NT or Pass).
/// With equal length, preserves "up the line" ordering (cheapest bid first),
/// with two exceptions at level 1:
/// - 4+ card equal-length minors: prefer diamonds over clubs
/// - 5+ card equal-length suits: prefer the higher-ranking suit
///
/// The 5+ rule is from SAYC: "with equal length suits of 5 or 6 cards
/// each, bid the higher ranking suit first." This is really an opening
/// rule — for responses with unequal lengths (e.g., 4H and 5S), you'd
/// bid the 4-card suit first to show both cheaply.
fn select_by_longest_suit(items: &[CallMenuItem], hand: &Hand) -> Option<Call> {
    let mut best: Option<(&CallMenuItem, Suit, u8)> = None;

    for item in items {
        let Some((suit, len)) = longest_shown_suit(item, hand) else {
            continue;
        };
        if let Some((best_item, best_suit, best_len)) = &best {
            if len > *best_len {
                best = Some((item, suit, len));
            } else if len == *best_len
                && is_level_1(&item.call)
                && is_level_1(&best_item.call)
                && suit != *best_suit
                && prefer_higher_ranking(len, suit, *best_suit)
            {
                best = Some((item, suit, len));
            }
        } else {
            best = Some((item, suit, len));
        }
    }

    best.map(|(item, _, _)| item.call)
}

/// Whether to prefer the higher-ranking suit over the lower one at level 1.
///
/// - 5+ cards: always prefer higher ranking (open 1S with 5-5 majors)
/// - 4 cards in both minors: prefer diamonds (open 1D with 4-4 minors)
/// - 4 cards in both majors: do NOT prefer higher — bid up the line (1H)
fn prefer_higher_ranking(len: u8, _candidate: Suit, _current_best: Suit) -> bool {
    if len >= 5 {
        return true;
    }
    if len >= 4 && _candidate.is_minor() && _current_best.is_minor() {
        return true;
    }
    false
}

/// Find the longest suit shown by a call's semantics, measured by the hand's
/// actual length. A bid may show multiple suits via multiple MinLength
/// constraints; this returns the suit where the hand is longest.
fn longest_shown_suit(item: &CallMenuItem, hand: &Hand) -> Option<(Suit, u8)> {
    item.semantics
        .shows
        .iter()
        .filter_map(|c| match c {
            HandConstraint::MinLength(suit, _) => {
                let len = hand.length(*suit);
                Some((*suit, len))
            }
            _ => None,
        })
        .max_by_key(|(_, len)| *len)
}

fn is_level_1(call: &Call) -> bool {
    matches!(call, Call::Bid { level: 1, .. })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nbk::CallSemantics;
    use types::Strain;

    /// Create a CallMenuItem showing MinLength for the bid's suit.
    fn make_item(level: u8, strain: Strain, min_length: u8) -> CallMenuItem {
        let suit = strain.to_suit().expect("test items must be suit bids");
        CallMenuItem {
            call: Call::Bid { level, strain },
            semantics: CallSemantics {
                shows: vec![HandConstraint::MinLength(suit, min_length)],
                rule_name: "test".to_string(),
                planner: None,
            },
        }
    }

    /// Create a CallMenuItem showing MinLength for multiple suits.
    fn make_multi_suit_item(level: u8, strain: Strain, suits: &[(Suit, u8)]) -> CallMenuItem {
        CallMenuItem {
            call: Call::Bid { level, strain },
            semantics: CallSemantics {
                shows: suits
                    .iter()
                    .map(|(s, l)| HandConstraint::MinLength(*s, *l))
                    .collect(),
                rule_name: "test".to_string(),
                planner: None,
            },
        }
    }

    /// Create a CallMenuItem with no MinLength constraints (e.g., NT or Pass).
    fn make_no_suit_item(level: u8, strain: Strain) -> CallMenuItem {
        CallMenuItem {
            call: Call::Bid { level, strain },
            semantics: CallSemantics {
                shows: vec![],
                rule_name: "test".to_string(),
                planner: None,
            },
        }
    }

    #[test]
    fn test_four_four_minors_prefers_diamonds() {
        // C.D.H.S: 4 clubs, 4 diamonds, 3 hearts, 2 spades
        let hand = Hand::parse("Q642.764A.KQ9.6J");
        let items = vec![
            make_item(1, Strain::Clubs, 4),
            make_item(1, Strain::Diamonds, 4),
        ];
        let result = select_best_from_group(&items, &hand);
        assert_eq!(
            result,
            Some(Call::Bid {
                level: 1,
                strain: Strain::Diamonds
            })
        );
    }

    #[test]
    fn test_three_three_minors_prefers_clubs() {
        // C.D.H.S: 3 clubs, 3 diamonds, 4 hearts, 3 spades
        let hand = Hand::parse("752.AKQ.QT76.K98");
        let items = vec![
            make_item(1, Strain::Clubs, 3),
            make_item(1, Strain::Diamonds, 3),
        ];
        let result = select_best_from_group(&items, &hand);
        assert_eq!(
            result,
            Some(Call::Bid {
                level: 1,
                strain: Strain::Clubs
            })
        );
    }

    #[test]
    fn test_longer_suit_preferred() {
        // C.D.H.S: 3 clubs, 5 diamonds, 3 hearts, 2 spades
        let hand = Hand::parse("K53.8JQ67.K76.AT");
        let items = vec![
            make_item(1, Strain::Clubs, 4),
            make_item(1, Strain::Diamonds, 4),
        ];
        let result = select_best_from_group(&items, &hand);
        assert_eq!(
            result,
            Some(Call::Bid {
                level: 1,
                strain: Strain::Diamonds
            })
        );
    }

    #[test]
    fn test_same_suit_different_levels_prefers_lower() {
        // C.D.H.S: 6 clubs, 2 diamonds, 4 hearts, 1 spade
        let hand = Hand::parse("AQJ754.K7.QJ72.6");
        let items = vec![
            make_item(3, Strain::Clubs, 6),
            make_item(5, Strain::Clubs, 6),
        ];
        let result = select_best_from_group(&items, &hand);
        assert_eq!(
            result,
            Some(Call::Bid {
                level: 3,
                strain: Strain::Clubs
            })
        );
    }

    #[test]
    fn test_four_four_majors_bids_up_the_line() {
        // C.D.H.S: 2 clubs, 3 diamonds, 4 hearts, 4 spades
        let hand = Hand::parse("42.652.8643.KQJ4");
        let items = vec![
            make_item(1, Strain::Hearts, 4),
            make_item(1, Strain::Spades, 4),
        ];
        let result = select_best_from_group(&items, &hand);
        assert_eq!(
            result,
            Some(Call::Bid {
                level: 1,
                strain: Strain::Hearts
            })
        );
    }

    #[test]
    fn test_five_five_majors_prefers_higher() {
        // C.D.H.S: 2 clubs, 1 diamond, 5 hearts, 5 spades
        let hand = Hand::parse("64.6.AK732.QJ854");
        let items = vec![
            make_item(1, Strain::Hearts, 5),
            make_item(1, Strain::Spades, 5),
        ];
        let result = select_best_from_group(&items, &hand);
        assert_eq!(
            result,
            Some(Call::Bid {
                level: 1,
                strain: Strain::Spades
            })
        );
    }

    #[test]
    fn test_minor_preference_only_at_level_1() {
        // C.D.H.S: 4 clubs, 4 diamonds, 3 hearts, 2 spades
        // At level 2, should preserve original order (clubs first).
        let hand = Hand::parse("Q642.764A.KQ9.6J");
        let items = vec![
            make_item(2, Strain::Clubs, 4),
            make_item(2, Strain::Diamonds, 4),
        ];
        let result = select_best_from_group(&items, &hand);
        assert_eq!(
            result,
            Some(Call::Bid {
                level: 2,
                strain: Strain::Clubs
            })
        );
    }

    #[test]
    fn test_multi_suit_bid_uses_longest() {
        // C.D.H.S: 3 clubs, 2 diamonds, 5 hearts, 3 spades
        // A bid showing both hearts(5) and spades(4) should use hearts length.
        let hand = Hand::parse("K53.K7.QJ872.A96");
        let items = vec![
            make_item(1, Strain::Hearts, 4),
            make_multi_suit_item(1, Strain::Spades, &[(Suit::Hearts, 4), (Suit::Spades, 4)]),
        ];
        let result = select_best_from_group(&items, &hand);
        // Both resolve to hearts length 5, so first wins (up the line).
        assert_eq!(
            result,
            Some(Call::Bid {
                level: 1,
                strain: Strain::Hearts
            })
        );
    }

    #[test]
    fn test_items_without_suit_constraints_skipped() {
        // C.D.H.S: 4 clubs, 4 diamonds, 3 hearts, 2 spades
        let hand = Hand::parse("Q642.764A.KQ9.6J");
        let items = vec![
            make_no_suit_item(1, Strain::Notrump),
            make_item(1, Strain::Diamonds, 4),
        ];
        let result = select_best_from_group(&items, &hand);
        assert_eq!(
            result,
            Some(Call::Bid {
                level: 1,
                strain: Strain::Diamonds
            })
        );
    }

    #[test]
    fn test_empty_group_returns_none() {
        let hand = Hand::parse("Q642.764A.KQ9.6J");
        let result = select_best_from_group(&[], &hand);
        assert_eq!(result, None);
    }

    #[test]
    fn test_all_no_suit_items_returns_first() {
        // When no items show a suit, fall back to the first item.
        let hand = Hand::parse("Q642.764A.KQ9.6J");
        let items = vec![
            make_no_suit_item(1, Strain::Notrump),
            make_no_suit_item(2, Strain::Notrump),
        ];
        let result = select_best_from_group(&items, &hand);
        assert_eq!(
            result,
            Some(Call::Bid {
                level: 1,
                strain: Strain::Notrump
            })
        );
    }
}
