use crate::dsl::planner::DefaultPlanner;
use crate::kernel::call_ranker::{CallRankItem, CallRanker};
use crate::kernel::call_trace::{CallSelectionStep, CallTrace};
use crate::kernel::AuctionModel;
use crate::kernel::HandConstraint;
use types::{Call, Hand, Suit};

/// Call selector implementing the Kernel priority stack
pub struct CallSelector;

impl CallSelector {
    /// Select the best call according to Kernel priority rules
    pub fn select_best_call(hand: &Hand, auction_model: &AuctionModel) -> Option<Call> {
        Self::select_best_call_with_trace(hand, auction_model).selected_call
    }

    /// Select the best call and return a detailed trace of the selection process
    pub fn select_best_call_with_trace(hand: &Hand, auction_model: &AuctionModel) -> CallTrace {
        let ranker = CallRanker::from_auction_model(auction_model);
        let mut call_selection_steps = Vec::new();
        let mut selected_call = None;

        let default_planner = DefaultPlanner;

        for group in &ranker.groups {
            let mut satisfied_in_group = Vec::new();

            for item in &group.items {
                let planner = item
                    .semantics
                    .planner
                    .as_ref()
                    .map(|p| p.as_ref())
                    .unwrap_or(&default_planner);

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

                call_selection_steps.push(CallSelectionStep {
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

        CallTrace {
            auction_model: auction_model.clone(),
            ranker,
            call_selection_steps,
            selected_call,
        }
    }
}

/// A strategy for choosing among satisfied calls in a group.
/// Returns `None` if it doesn't apply, deferring to the next chooser.
trait GroupChooser {
    fn choose(&self, items: &[CallRankItem], hand: &Hand) -> Option<Call>;
}

/// Select the best item from a group of satisfied items.
///
/// Consults choosers in priority order; first to return `Some` wins.
fn select_best_from_group(items: &[CallRankItem], hand: &Hand) -> Option<Call> {
    let choosers: &[&dyn GroupChooser] = &[
        &UniqueLongestSuit,
        &PreferHigherMinor,
        &PreferHigherWithFivePlus,
        &PreferShowingLongerLength,
        &FirstCall,
    ];
    choosers.iter().find_map(|c| c.choose(items, hand))
}

/// Pick the call showing a strictly longest suit. Returns `None` if there's
/// a tie or no items show a suit.
struct UniqueLongestSuit;

impl GroupChooser for UniqueLongestSuit {
    fn choose(&self, items: &[CallRankItem], hand: &Hand) -> Option<Call> {
        let mut best: Option<(&CallRankItem, u8)> = None;
        let mut tied = false;

        for item in items {
            let Some((_, len)) = longest_shown_suit(item, hand) else {
                continue;
            };
            match &best {
                Some((_, best_len)) if len > *best_len => {
                    best = Some((item, len));
                    tied = false;
                }
                Some((_, best_len)) if len == *best_len => {
                    tied = true;
                }
                None => {
                    best = Some((item, len));
                }
                _ => {}
            }
        }

        if tied {
            return None;
        }
        best.map(|(item, _)| item.call)
    }
}

/// When multiple calls are satisfied in the same group, prefer the one
/// that shows a longer suit.
struct PreferShowingLongerLength;

impl GroupChooser for PreferShowingLongerLength {
    fn choose(&self, items: &[CallRankItem], hand: &Hand) -> Option<Call> {
        let mapped_items = items.iter().map(|item| {
            if let Some((_, length)) = longest_shown_suit(item, hand) {
                (item, length)
            } else {
                (item, 0)
            }
        });
        first_max_by_key(mapped_items, |(_, length)| *length).map(|(item, _)| item.call)
    }
}

/// With 4+ card equal-length minors at level 1, prefer diamonds over clubs.
struct PreferHigherMinor;

impl GroupChooser for PreferHigherMinor {
    fn choose(&self, items: &[CallRankItem], hand: &Hand) -> Option<Call> {
        let minor_items: Vec<_> = items
            .iter()
            .filter(|item| is_level_1(&item.call))
            .filter_map(|item| {
                let (suit, len) = longest_shown_suit(item, hand)?;
                if len >= 4 && suit.is_minor() {
                    Some((item, suit, len))
                } else {
                    None
                }
            })
            .collect();

        if !has_tied_distinct_suits(&minor_items) {
            return None;
        }

        // Pick the highest-ranking minor (diamonds > clubs).
        first_max_by_key(minor_items.iter(), |(_, suit, _)| *suit as u8)
            .map(|(item, _, _)| item.call)
    }
}

/// With 5+ card equal-length suits at level 1, prefer the higher-ranking suit.
/// SAYC: "with equal length suits of 5 or 6 cards each, bid the higher
/// ranking suit first." This is really an opening rule.
struct PreferHigherWithFivePlus;

impl GroupChooser for PreferHigherWithFivePlus {
    fn choose(&self, items: &[CallRankItem], hand: &Hand) -> Option<Call> {
        let suit_items: Vec<_> = items
            .iter()
            .filter(|item| is_level_1(&item.call))
            .filter_map(|item| {
                let (suit, len) = longest_shown_suit(item, hand)?;
                if len >= 5 {
                    Some((item, suit, len))
                } else {
                    None
                }
            })
            .collect();

        if !has_tied_distinct_suits(&suit_items) {
            return None;
        }

        first_max_by_key(suit_items.iter(), |(_, suit, _)| *suit as u8)
            .map(|(item, _, _)| item.call)
    }
}

/// Fallback: pick the first (lowest) call in the group.
struct FirstCall;

impl GroupChooser for FirstCall {
    fn choose(&self, items: &[CallRankItem], _hand: &Hand) -> Option<Call> {
        items.first().map(|item| item.call)
    }
}

/// Check that candidates have 2+ items, all at the same length, with at
/// least two distinct suits.
fn has_tied_distinct_suits(candidates: &[(&CallRankItem, Suit, u8)]) -> bool {
    if candidates.len() < 2 {
        return false;
    }
    let length = candidates[0].2;
    if !candidates.iter().all(|(_, _, l)| *l == length) {
        return false;
    }
    let first_suit = candidates[0].1;
    candidates.iter().any(|(_, s, _)| *s != first_suit)
}

/// Find the longest suit shown by a call's semantics, measured by the hand's
/// actual length. A bid may show multiple suits via multiple MinLength
/// constraints; this returns the suit where the hand is longest.
fn longest_shown_suit(item: &CallRankItem, hand: &Hand) -> Option<(Suit, u8)> {
    let shown_suits = item.semantics.shows.iter().filter_map(|c| match c {
        HandConstraint::MinLength(suit, _) => {
            let length = hand.length(*suit);
            Some((*suit, length))
        }
        _ => None,
    });
    first_max_by_key(shown_suits, |(_, length)| *length)
}

fn is_level_1(call: &Call) -> bool {
    call.level() == Some(1)
}

/// Find the first element that yields the maximum value of a key.
/// Similar to Iterator::max_by_key, but returns the first max in case of ties.
fn first_max_by_key<I, B, F>(iter: I, mut f: F) -> Option<I::Item>
where
    I: IntoIterator,
    B: Ord,
    F: FnMut(&I::Item) -> B,
{
    let mut iter = iter.into_iter();
    let mut max_item = iter.next()?;
    let mut max_key = f(&max_item);

    for item in iter {
        let key = f(&item);
        if key > max_key {
            max_item = item;
            max_key = key;
        }
    }
    Some(max_item)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::CallSemantics;
    use types::Strain;

    /// Create a CallRankItem showing MinLength for the bid's suit.
    fn make_item(level: u8, strain: Strain, min_length: u8) -> CallRankItem {
        let suit = strain.to_suit().expect("test items must be suit bids");
        CallRankItem {
            call: Call::Bid { level, strain },
            semantics: CallSemantics {
                shows: vec![HandConstraint::MinLength(suit, min_length)],
                annotations: vec![],
                rule_name: "test".to_string(),
                planner: None,
            },
        }
    }

    /// Create a CallRankItem showing MinLength for multiple suits.
    fn make_multi_suit_item(level: u8, strain: Strain, suits: &[(Suit, u8)]) -> CallRankItem {
        CallRankItem {
            call: Call::Bid { level, strain },
            semantics: CallSemantics {
                shows: suits
                    .iter()
                    .map(|(s, l)| HandConstraint::MinLength(*s, *l))
                    .collect(),
                annotations: vec![],
                rule_name: "test".to_string(),
                planner: None,
            },
        }
    }

    /// Create a CallRankItem with no MinLength constraints (e.g., NT or Pass).
    fn make_no_suit_item(level: u8, strain: Strain) -> CallRankItem {
        CallRankItem {
            call: Call::Bid { level, strain },
            semantics: CallSemantics {
                shows: vec![],
                annotations: vec![],
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

    #[test]
    fn test_prefer_showing_longer_length() {
        // C.D.H.S: 2 clubs, 3 diamonds, 3 hearts, 5 spades
        let hand = Hand::parse("32.432.432.AKQJ2");
        let items = vec![
            CallRankItem {
                call: Call::Double,
                semantics: CallSemantics {
                    shows: vec![
                        HandConstraint::MinLength(Suit::Spades, 4),
                        HandConstraint::MinLength(Suit::Hearts, 4),
                    ],
                    annotations: vec![],
                    rule_name: "test".to_string(),
                    planner: None,
                },
            },
            make_item(1, Strain::Spades, 5),
        ];

        let result = select_best_from_group(&items, &hand);
        // Both show length 5 (actual), so they tie at UniqueLongestSuit.
        // PreferShowingLongerLength should pick Double (the first item).
        assert_eq!(result, Some(Call::Double));
    }
}
