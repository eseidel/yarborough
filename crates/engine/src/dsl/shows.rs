use crate::kernel::{AuctionModel, HandConstraint};
use std::fmt::Debug;
use types::{Call, Shape, Suit};

pub trait Shows: Send + Sync + Debug {
    fn show(&self, auction: &AuctionModel, call: &Call) -> Vec<HandConstraint>;
}

// ---------------------------------------------------------------------------
// Macros for common Show patterns
// ---------------------------------------------------------------------------

/// Show that produces constraints without needing auction or call context.
macro_rules! const_show {
    ($(#[$attr:meta])* $name:ident => $body:expr) => {
        $(#[$attr])*
        #[derive(Debug)]
        pub struct $name;
        impl Shows for $name {
            fn show(&self, _auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
                $body
            }
        }
    };
    ($(#[$attr:meta])* $name:ident($(pub $ty:ty),+) => |$s:ident| $body:expr) => {
        $(#[$attr])*
        #[derive(Debug)]
        pub struct $name($(pub $ty),+);
        impl Shows for $name {
            fn show(&self, _auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
                let $s = self;
                $body
            }
        }
    };
}

/// Show that extracts the suit from the call and produces constraints for it.
macro_rules! call_suit_show {
    ($(#[$attr:meta])* $name:ident => |$suit:ident| $body:expr) => {
        $(#[$attr])*
        #[derive(Debug)]
        pub struct $name;
        impl Shows for $name {
            fn show(&self, _auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
                if let Some($suit) = call.suit() {
                    return $body;
                }
                vec![]
            }
        }
    };
    ($(#[$attr:meta])* $name:ident($(pub $ty:ty),+) => |$s:ident, $suit:ident| $body:expr) => {
        $(#[$attr])*
        #[derive(Debug)]
        pub struct $name($(pub $ty),+);
        impl Shows for $name {
            fn show(&self, _auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
                let $s = self;
                if let Some($suit) = call.suit() {
                    return $body;
                }
                vec![]
            }
        }
    };
}

// ---------------------------------------------------------------------------
// Simple constant shows
// ---------------------------------------------------------------------------

const_show!(ShowMinHcp(pub u8) => |s| vec![HandConstraint::MinHcp(s.0)]);
const_show!(ShowMaxHcp(pub u8) => |s| vec![HandConstraint::MaxHcp(s.0)]);
const_show!(ShowHcpRange(pub u8, pub u8) => |s| vec![
    HandConstraint::MinHcp(s.0),
    HandConstraint::MaxHcp(s.1),
]);
const_show!(ShowBalanced => vec![HandConstraint::MaxUnbalancedness(Shape::Balanced)]);
const_show!(ShowSemiBalanced => vec![HandConstraint::MaxUnbalancedness(Shape::SemiBalanced)]);
const_show!(ShowRuleOfFifteen => vec![HandConstraint::RuleOfFifteen]);
const_show!(
    #[allow(dead_code)]
    ShowMinLength(pub Suit, pub u8) => |s| vec![HandConstraint::MinLength(s.0, s.1)]
);

// ---------------------------------------------------------------------------
// Call-suit shows (extract suit from the bid)
// ---------------------------------------------------------------------------

call_suit_show!(
    /// Requires 2+ of the top 3 honors {A, K, Q} in the bid suit.
    #[allow(dead_code)]
    ShowTwoOfTopThree => |suit| vec![HandConstraint::TwoOfTopThree(suit)]
);
call_suit_show!(
    /// Requires good suit quality: 2 of top 3 OR 3 of top 5 honors in the bid suit.
    ShowThreeOfTopFiveOrBetter => |suit| vec![HandConstraint::ThreeOfTopFiveOrBetter(suit)]
);
call_suit_show!(ShowMinSuitLength(pub u8) => |s, suit| vec![HandConstraint::MinLength(suit, s.0)]);
call_suit_show!(
    #[allow(dead_code)]
    ShowMaxLength(pub u8) => |s, suit| vec![HandConstraint::MaxLength(suit, s.0)]
);

// ---------------------------------------------------------------------------
// Complex shows (require custom logic with auction/call context)
// ---------------------------------------------------------------------------

/// Requires a stopper in each suit the opponents have shown.
#[derive(Debug)]
pub struct ShowStopperInOpponentSuit;
impl Shows for ShowStopperInOpponentSuit {
    fn show(&self, auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        Suit::ALL
            .iter()
            .filter(|&&suit| {
                auction.rho_hand().has_shown_suit(suit) || auction.lho_hand().has_shown_suit(suit)
            })
            .map(|&suit| HandConstraint::StopperIn(suit))
            .collect()
    }
}

/// Shows 4+ cards in each major suit not shown by partner, LHO, or RHO.
/// Used for negative doubles to show the unbid major(s).
#[derive(Debug)]
pub struct ShowFourInUnbidMajors;
impl Shows for ShowFourInUnbidMajors {
    fn show(&self, auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        [Suit::Hearts, Suit::Spades]
            .iter()
            .filter(|&&suit| {
                !auction.partner_hand().has_shown_suit(suit)
                    && !auction.lho_hand().has_shown_suit(suit)
                    && !auction.rho_hand().has_shown_suit(suit)
            })
            .map(|&suit| HandConstraint::MinLength(suit, 4))
            .collect()
    }
}

/// Shows 3+ cards in each suit that opponents have NOT shown.
#[derive(Debug)]
pub struct ShowSupportForUnbidSuits;
impl Shows for ShowSupportForUnbidSuits {
    fn show(&self, auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        Suit::ALL
            .iter()
            .filter(|&&suit| {
                !auction.rho_hand().has_shown_suit(suit) && !auction.lho_hand().has_shown_suit(suit)
            })
            .map(|&suit| HandConstraint::MinLength(suit, 3))
            .collect()
    }
}

#[derive(Debug)]
pub struct ShowSufficientValues;
impl Shows for ShowSufficientValues {
    fn show(&self, auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        let Some(level) = call.level() else {
            return vec![];
        };

        const SUITED_POINTS: [u8; 7] = [16, 19, 22, 25, 28, 33, 37];
        const NT_POINTS: [u8; 7] = [19, 22, 25, 28, 30, 33, 37];

        let min_combined_points = if call.suit().is_some() {
            SUITED_POINTS[level as usize - 1]
        } else {
            NT_POINTS[level as usize - 1]
        };

        let partner_min = auction.partner_hand().min_hcp.unwrap_or(0);
        let needed_hcp = min_combined_points.saturating_sub(partner_min);

        vec![HandConstraint::MinHcp(needed_hcp)]
    }
}

#[derive(Debug)]
pub struct ShowOpeningSuitLength;
impl Shows for ShowOpeningSuitLength {
    fn show(&self, _auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Some(suit) = call.suit() {
            let length = if suit.is_major() { 5 } else { 4 };
            return vec![HandConstraint::MinLength(suit, length)];
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowPreemptLength;
impl Shows for ShowPreemptLength {
    fn show(&self, _auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let (Some(level), Some(suit)) = (call.level(), call.suit()) {
            return vec![HandConstraint::MinLength(suit, level + 4)];
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowSupportValues;
impl Shows for ShowSupportValues {
    fn show(&self, auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Some(level) = call.level() {
            const SUPPORT_VALUES: [u8; 7] = [18, 18, 22, 25, 28, 33, 37];
            let min_combined_points = SUPPORT_VALUES[level as usize - 1];
            let needed_hcp =
                min_combined_points.saturating_sub(auction.partner_hand().min_hcp.unwrap_or(0));
            return vec![HandConstraint::MinHcp(needed_hcp)];
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowSupportLength;
impl Shows for ShowSupportLength {
    fn show(&self, auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Some(suit) = call.suit() {
            let needed_len = auction
                .partner_hand()
                .length_needed_to_reach_target(suit, 8);
            return vec![HandConstraint::MinLength(suit, needed_len)];
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowBetterContractIsRemote;
impl Shows for ShowBetterContractIsRemote {
    fn show(&self, auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Call::Pass = call {
            let partner_max_hcp = auction.partner_hand().max_hcp.unwrap_or(0); // Should be Some due to Predicate
            let our_partnership = auction.auction.current_partnership();
            let contract = if let Some(c) = auction.auction.current_contract() {
                if c.belongs_to(our_partnership) {
                    c
                } else {
                    return vec![];
                }
            } else {
                return vec![];
            };

            if contract.is_grand_slam() {
                return vec![];
            }

            const GAME_THRESHOLD: u8 = 25;
            const SLAM_THRESHOLD: u8 = 33;
            const GRAND_SLAM_THRESHOLD: u8 = 37;

            let goal = if contract.is_slam() {
                GRAND_SLAM_THRESHOLD
            } else if contract.is_game() {
                SLAM_THRESHOLD
            } else {
                GAME_THRESHOLD
            };

            let threshold = (goal - 1).saturating_sub(partner_max_hcp);
            vec![HandConstraint::MaxHcp(threshold)]
        } else {
            vec![]
        }
    }
}
