//! Call selection with priority resolution
//!
//! Uses CallMenu to group and prioritize legal calls.

use crate::nbk::call_menu::{CallMenu, CallMenuItem};
use crate::nbk::{AuctionModel, HandModel};
use bridge_core::Call;

/// Call selector implementing the NBK priority stack
pub struct CallSelector;

impl CallSelector {
    /// Select the best call according to NBK priority rules
    pub fn select_best_call(hand_model: &HandModel, auction_model: &AuctionModel) -> Option<Call> {
        let menu = CallMenu::from_auction_model(auction_model);

        for group in menu.groups {
            let satisfied: Vec<CallMenuItem> = group
                .items
                .into_iter()
                .filter(|item| hand_model.satisfies_all(item.semantics.shows.clone()))
                .collect();

            if let Some(call) = select_best_from_group(&satisfied, hand_model) {
                return Some(call);
            }
        }

        None
    }
}

/// Select the best item from a group of satisfied items
fn select_best_from_group(items: &[CallMenuItem], _hand_model: &HandModel) -> Option<Call> {
    // TODO: Decide which call best satisfies the hand.
    items.first().map(|item| item.call)
}
