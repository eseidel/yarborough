use crate::nbk::call_menu::{CallMenu, CallMenuItem};
use crate::nbk::trace::{BidTrace, SelectionStep};
use crate::nbk::{AuctionModel, HandModel};
use bridge_core::Call;

/// Call selector implementing the NBK priority stack
pub struct CallSelector;

impl CallSelector {
    /// Select the best call according to NBK priority rules
    pub fn select_best_call(hand_model: &HandModel, auction_model: &AuctionModel) -> Option<Call> {
        Self::select_best_call_with_trace(hand_model, auction_model).selected_call
    }

    /// Select the best call and return a detailed trace of the selection process
    pub fn select_best_call_with_trace(
        hand_model: &HandModel,
        auction_model: &AuctionModel,
    ) -> BidTrace {
        let menu = CallMenu::from_auction_model(auction_model);
        let mut selection_steps = Vec::new();
        let mut selected_call = None;

        for group in &menu.groups {
            let mut satisfied_in_group = Vec::new();

            for item in &group.items {
                let mut failed_constraints = Vec::new();
                for constraint in &item.semantics.shows {
                    if !hand_model.satisfies(*constraint) {
                        failed_constraints.push(*constraint);
                    }
                }

                let satisfied = failed_constraints.is_empty();
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

            if let Some(call) = select_best_from_group(&satisfied_in_group, hand_model) {
                selected_call = Some(call);
                break;
            }
        }

        BidTrace {
            hand_model: hand_model.clone(),
            menu,
            selection_steps,
            selected_call,
        }
    }
}

/// Select the best item from a group of satisfied items
fn select_best_from_group(items: &[CallMenuItem], _hand_model: &HandModel) -> Option<Call> {
    // TODO: Decide which call best satisfies the hand.
    items.first().map(|item| item.call)
}
