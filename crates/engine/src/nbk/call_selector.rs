use crate::dsl::planner::GenuinePlanner;
use crate::nbk::call_menu::{CallMenu, CallMenuItem};
use crate::nbk::trace::{BidTrace, SelectionStep};
use crate::nbk::AuctionModel;
use types::{Call, Hand, Strain};

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
/// When multiple calls in a group are satisfied, prefer the one whose suit
/// is longest in the hand. With equal length, generally preserve the original
/// "up the line" ordering (cheapest bid first), except for equal-length minors
/// with 4+ cards where SAYC prefers the higher-ranking minor (1D over 1C).
fn select_best_from_group(items: &[CallMenuItem], hand: &Hand) -> Option<Call> {
    if items.is_empty() {
        return None;
    }

    let mut best = &items[0];
    let mut best_len = call_suit_length(&best.call, hand);

    for item in &items[1..] {
        let len = call_suit_length(&item.call, hand);
        if len > best_len {
            best = item;
            best_len = len;
        } else if len == best_len
            && len >= 4
            && is_minor_suit_bid(&item.call)
            && is_minor_suit_bid(&best.call)
            && call_strain(&item.call) != call_strain(&best.call)
        {
            // With 4-4 or 5-5 in different minors, prefer diamonds over clubs.
            best = item;
        }
    }

    Some(best.call)
}

fn call_suit_length(call: &Call, hand: &Hand) -> u8 {
    match call {
        Call::Bid { strain, .. } => strain.to_suit().map(|s| hand.length(s)).unwrap_or(0),
        _ => 0,
    }
}

fn call_strain(call: &Call) -> Option<Strain> {
    match call {
        Call::Bid { strain, .. } => Some(*strain),
        _ => None,
    }
}

fn is_minor_suit_bid(call: &Call) -> bool {
    matches!(call, Call::Bid { strain, .. } if strain.is_minor())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nbk::CallSemantics;

    fn make_item(level: u8, strain: Strain) -> CallMenuItem {
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
        let items = vec![make_item(1, Strain::Clubs), make_item(1, Strain::Diamonds)];
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
        let items = vec![make_item(1, Strain::Clubs), make_item(1, Strain::Diamonds)];
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
        let items = vec![make_item(1, Strain::Clubs), make_item(1, Strain::Diamonds)];
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
        let items = vec![make_item(3, Strain::Clubs), make_item(5, Strain::Clubs)];
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
        let items = vec![make_item(1, Strain::Hearts), make_item(1, Strain::Spades)];
        let result = select_best_from_group(&items, &hand);
        assert_eq!(
            result,
            Some(Call::Bid {
                level: 1,
                strain: Strain::Hearts
            })
        );
    }
}
