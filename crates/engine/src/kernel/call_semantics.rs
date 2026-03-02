//! Semantic meaning of calls in the Kernel model

use crate::dsl::annotations::Annotation;
use crate::dsl::planner::Planner;
use crate::kernel::{AuctionModel, CallPurpose, HandConstraint};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Semantic meaning of a call
#[derive(Clone, Serialize, Deserialize)]
pub struct CallSemantics {
    /// What this call shows about our hand
    pub shows: Vec<HandConstraint>,
    /// Metadata about the bid (not hand constraints)
    pub annotations: Vec<Annotation>,
    /// Name of the rule that generated these semantics
    pub rule_name: String,
    /// Optional planner for selecting the bid
    #[serde(skip)]
    pub planner: Option<Arc<dyn Planner>>,
}

impl CallSemantics {
    /// Determine the purpose category for a bid based on its annotations and constraints.
    pub fn get_purpose(&self, auction_model: &AuctionModel) -> CallPurpose {
        let mut best_purpose = CallPurpose::Miscellaneous;
        let mut did_show_length = false;
        let mut did_characterize_strength = false;

        // Check annotations first
        if self.annotations.contains(&Annotation::NotrumpSystemsOn) {
            best_purpose = best_purpose.min(CallPurpose::EnterNotrumpSystem);
        }

        for constraint in &self.shows {
            match *constraint {
                HandConstraint::MinLength(suit, now_shown) => {
                    if auction_model.partner_hand().has_shown_suit(suit) {
                        if suit.is_major() {
                            best_purpose = best_purpose.min(CallPurpose::SupportMajors);
                        } else if suit.is_minor() {
                            best_purpose = best_purpose.min(CallPurpose::SupportMinors);
                        }
                    } else {
                        let already_known = auction_model.bidder_hand().min_length(suit);
                        if now_shown > already_known {
                            if already_known >= 4 {
                                best_purpose = best_purpose.min(CallPurpose::RebidSuit);
                            } else if suit.is_major() {
                                best_purpose = best_purpose.min(CallPurpose::MajorDiscovery);
                            } else if suit.is_minor() {
                                best_purpose = best_purpose.min(CallPurpose::MinorDiscovery);
                            }
                        }
                    }
                    did_show_length = true;
                }
                HandConstraint::MinHcp(now_shown) => {
                    if now_shown > auction_model.bidder_hand().min_hcp.unwrap_or(0) {
                        did_characterize_strength = true;
                    }
                }
                HandConstraint::MaxHcp(now_shown) => {
                    if now_shown < auction_model.bidder_hand().max_hcp.unwrap_or(40) {
                        did_characterize_strength = true;
                    }
                }
                _ => {}
            }
        }

        if !did_show_length && did_characterize_strength {
            best_purpose = best_purpose.min(CallPurpose::CharacterizeStrength);
        }

        best_purpose
    }
}

impl std::fmt::Debug for CallSemantics {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CallSemantics")
            .field("shows", &self.shows)
            .field("annotations", &self.annotations)
            .field("rule_name", &self.rule_name)
            .field("planner", &self.planner.as_ref().map(|_| "Some(Planner)"))
            .finish()
    }
}
