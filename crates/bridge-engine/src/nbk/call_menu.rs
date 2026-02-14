//! Call menu for structured bidding interfaces
//!
//! Provides a way to group legal calls by their semantic meaning.

use crate::nbk::{AuctionModel, CallInterpreter, CallPurpose, CallSemantics, HandConstraint};
use bridge_core::Call;
use serde::{Deserialize, Serialize};

/// An item in the call menu
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CallMenuItem {
    /// The call to be made
    pub call: Call,
    /// The semantics of the call
    pub semantics: CallSemantics,
}

/// A group of calls in the menu
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CallMenuGroup {
    /// The name of the group
    pub name: String,
    /// The calls in the group
    pub items: Vec<CallMenuItem>,
}

/// A structured menu of legal calls and their meanings
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CallMenu {
    /// The groups of calls in the menu
    pub groups: Vec<CallMenuGroup>,
}

/// Types of predefined call groups in the NBK model
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum CallMenuGroupType {
    /// Support major suits with limit purpose
    SupportMajors = 0,
    /// Show major length using discovery purpose
    MajorDiscovery = 1,
    /// Limit the strength of the hand (includes Pass and No Trump)
    LimitStrength = 2,
    /// Support minor suits with limit purpose
    SupportMinors = 3,
    /// Show minor length with discovery purpose
    MinorDiscovery = 4,
    /// Show length with a rebid in limit purpose
    Rebids = 5,
    /// Bids that don't fit into other categories
    Miscellaneous = 6,
}

impl CallMenuGroupType {
    /// Get the display name for the group type
    pub fn name(&self) -> &'static str {
        match self {
            Self::SupportMajors => "Support Majors",
            Self::MajorDiscovery => "Major Discovery",
            Self::LimitStrength => "Limit Strength",
            Self::SupportMinors => "Support Minors",
            Self::MinorDiscovery => "Minor Discovery",
            Self::Rebids => "Rebids",
            Self::Miscellaneous => "Miscellaneous",
        }
    }

    /// All available group types in priority order
    pub const ALL: [Self; 7] = [
        Self::SupportMajors,
        Self::MajorDiscovery,
        Self::LimitStrength,
        Self::SupportMinors,
        Self::MinorDiscovery,
        Self::Rebids,
        Self::Miscellaneous,
    ];
}

impl CallMenu {
    /// Build a call menu from an auction model using standard NBK grouping
    pub fn from_auction_model(auction_model: &AuctionModel) -> Self {
        let legal_calls = auction_model.auction.legal_calls();

        let mut group_items: [Vec<CallMenuItem>; 7] = [
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
        ];

        for call in legal_calls {
            if let Some(semantics) = CallInterpreter::interpret(auction_model, &call) {
                let mut best_group = CallMenuGroupType::Miscellaneous;

                match semantics.purpose {
                    CallPurpose::Limit => {
                        let mut did_show_length = false;
                        let mut did_limit_strength = false;
                        for constraint in &semantics.shows {
                            if let HandConstraint::MinLength(suit, now_shown) = *constraint {
                                if auction_model.partner_model.has_shown_suit(suit) {
                                    if suit.is_major() {
                                        best_group =
                                            best_group.min(CallMenuGroupType::SupportMajors);
                                    } else if suit.is_minor() {
                                        best_group =
                                            best_group.min(CallMenuGroupType::SupportMinors);
                                    }
                                } else {
                                    let already_known = auction_model.bidder_model.min_length(suit);
                                    if now_shown > already_known {
                                        best_group = best_group.min(CallMenuGroupType::Rebids);
                                    }
                                }
                                did_show_length = true;
                            } else if let HandConstraint::MinHcp(now_shown) = *constraint {
                                if now_shown < auction_model.bidder_model.max_hcp.unwrap_or(40) {
                                    did_limit_strength = true;
                                }
                            }
                        }
                        if !did_show_length && did_limit_strength {
                            best_group = best_group.min(CallMenuGroupType::LimitStrength);
                        }
                    }
                    CallPurpose::Discovery => {
                        for constraint in &semantics.shows {
                            if let HandConstraint::MinLength(suit, now_shown) = *constraint {
                                let already_known = auction_model.bidder_model.min_length(suit);
                                if now_shown > already_known {
                                    if suit.is_major() {
                                        best_group =
                                            best_group.min(CallMenuGroupType::MajorDiscovery);
                                    } else if suit.is_minor() {
                                        best_group =
                                            best_group.min(CallMenuGroupType::MinorDiscovery);
                                    }
                                }
                            }
                        }
                    }
                }

                group_items[best_group as usize].push(CallMenuItem { call, semantics });
            }
        }

        let mut menu = Self::default();
        for group_type in CallMenuGroupType::ALL {
            menu = menu.with_group(group_type.name(), group_items[group_type as usize].clone());
        }

        menu
    }

    /// Add a group of calls to the menu
    pub fn with_group(mut self, name: &str, items: Vec<CallMenuItem>) -> Self {
        if !items.is_empty() {
            self.groups.push(CallMenuGroup {
                name: name.to_string(),
                items,
            });
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_core::{Auction, Position, Strain};

    #[test]
    fn test_call_menu_empty_auction() {
        let auction = Auction::new(Position::North);
        let auction_model = AuctionModel::from_auction(&auction, Position::North);
        let menu = CallMenu::from_auction_model(&auction_model);

        // At the start, only Discovery bids (and maybe some NT limit bids if configured)
        // Group: Limit Strength (includes Pass)
        // Group: Major Discovery (1H, 1S)
        // Group: Minor Discovery (1C, 1D)

        let limit_strength = menu.groups.iter().find(|g| g.name == "Limit Strength");
        assert!(limit_strength.is_some());

        let discovery_majors = menu.groups.iter().find(|g| g.name == "Major Discovery");
        assert!(discovery_majors.is_some());

        let discovery_minors = menu.groups.iter().find(|g| g.name == "Minor Discovery");
        assert!(discovery_minors.is_some());
    }

    #[test]
    fn test_call_menu_after_opening() {
        let mut auction = Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Hearts,
        });
        auction.add_call(Call::Pass); // East

        // South's turn
        let auction_model = AuctionModel::from_auction(&auction, Position::South);
        let menu = CallMenu::from_auction_model(&auction_model);

        // South should see:
        // Group: Support Majors (2H, 3H, 4H)
        // Group: Major Discovery (1S)
        // Group: Limit Strength (Pass, NT bids)
        // Group: Minor Discovery (2C, 2D)

        assert!(menu.groups.iter().any(|g| g.name == "Support Majors"));
        assert!(menu.groups.iter().any(|g| g.name == "Major Discovery"));
        assert!(menu.groups.iter().any(|g| g.name == "Limit Strength"));
        assert!(menu.groups.iter().any(|g| g.name == "Minor Discovery"));
    }
}
