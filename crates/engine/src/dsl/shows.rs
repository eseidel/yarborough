use crate::kernel::{AuctionModel, HandConstraint};
use std::fmt::Debug;
use types::{Call, Shape, Strain, Suit};

pub trait Shows: Send + Sync + Debug {
    fn show(&self, model: &AuctionModel, call: &Call) -> Vec<HandConstraint>;
}

// ---------------------------------------------------------------------------
// Constants and Helpers
// ---------------------------------------------------------------------------

const SUITED_POINTS: [u8; 7] = [16, 19, 22, 25, 28, 33, 37];
const NT_POINTS: [u8; 7] = [19, 22, 25, 28, 30, 33, 37];
const SUPPORT_VALUES: [u8; 7] = [18, 18, 22, 25, 28, 33, 37];

fn hcp_needed_to_reach(model: &AuctionModel, total: u8) -> u8 {
    total.saturating_sub(model.partner_hand().min_hcp.unwrap_or(0))
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
            fn show(&self, _model: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
                $body
            }
        }
    };
    ($(#[$attr:meta])* $name:ident($(pub $ty:ty),+) => |$s:ident| $body:expr) => {
        $(#[$attr])*
        #[derive(Debug)]
        pub struct $name($(pub $ty),+);
        impl Shows for $name {
            fn show(&self, _model: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
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
            fn show(&self, _model: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
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
            fn show(&self, _model: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
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
    fn show(&self, model: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        Suit::ALL
            .iter()
            .filter(|&&suit| {
                model.rho_hand().has_shown_suit(suit) || model.lho_hand().has_shown_suit(suit)
            })
            .map(|&suit| HandConstraint::StopperIn(suit))
            .collect()
    }
}

/// Shows 4+ cards in each major suit not shown by partner, LHO, or RHO.
/// Used for negative doubles to show the unbid major(s).
#[derive(Debug)]
pub struct ShowMinLengthInUnbidMajors(pub u8);
impl Shows for ShowMinLengthInUnbidMajors {
    fn show(&self, model: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        [Suit::Hearts, Suit::Spades]
            .iter()
            .filter(|&&suit| {
                !model.partner_hand().has_shown_suit(suit)
                    && !model.lho_hand().has_shown_suit(suit)
                    && !model.rho_hand().has_shown_suit(suit)
            })
            .map(|&suit| HandConstraint::MinLength(suit, self.0))
            .collect()
    }
}

/// Shows 3+ cards in each suit that opponents have NOT shown.
#[derive(Debug)]
pub struct ShowSupportForUnbidSuits;
impl Shows for ShowSupportForUnbidSuits {
    fn show(&self, model: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        Suit::ALL
            .iter()
            .filter(|&&suit| {
                !model.rho_hand().has_shown_suit(suit) && !model.lho_hand().has_shown_suit(suit)
            })
            .map(|&suit| HandConstraint::MinLength(suit, 3))
            .collect()
    }
}

#[derive(Debug)]
pub struct ShowSufficientValues;
impl Shows for ShowSufficientValues {
    fn show(&self, model: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        let Some(level) = call.level() else {
            return vec![];
        };

        let min_combined_points = if call.suit().is_some() {
            SUITED_POINTS[level as usize - 1]
        } else {
            NT_POINTS[level as usize - 1]
        };

        vec![HandConstraint::MinHcp(hcp_needed_to_reach(
            model,
            min_combined_points,
        ))]
    }
}

#[derive(Debug)]
pub struct ShowOpeningSuitLength;
impl Shows for ShowOpeningSuitLength {
    fn show(&self, _model: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
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
    fn show(&self, _model: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let (Some(level), Some(suit)) = (call.level(), call.suit()) {
            return vec![HandConstraint::MinLength(suit, level + 4)];
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowSupportValues;
impl Shows for ShowSupportValues {
    fn show(&self, model: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Some(level) = call.level() {
            let min_combined_points = SUPPORT_VALUES[level as usize - 1];
            return vec![HandConstraint::MinHcp(hcp_needed_to_reach(
                model,
                min_combined_points,
            ))];
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowSupportLength;
impl Shows for ShowSupportLength {
    fn show(&self, model: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Some(suit) = call.suit() {
            let needed_len = model.partner_hand().length_needed_to_reach_target(suit, 8);
            return vec![HandConstraint::MinLength(suit, needed_len)];
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowLawOfTotalTricks;
impl Shows for ShowLawOfTotalTricks {
    fn show(&self, model: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let (Some(level), Some(suit)) = (call.level(), call.suit()) {
            let needed_len = model
                .partner_hand()
                .length_needed_to_reach_target(suit, level + 6);
            return vec![HandConstraint::MinLength(suit, needed_len)];
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowMinCombinedPointsForPartnerMinimumSuitedRebid;
impl Shows for ShowMinCombinedPointsForPartnerMinimumSuitedRebid {
    fn show(&self, model: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        let suits = model.partner_hand().shown_suits();
        if suits.is_empty() {
            return vec![];
        }

        let mut test_auction = model.auction.clone();
        test_auction.add_call(*call);

        let min_level = suits
            .into_iter()
            .map(Strain::from_suit)
            .filter_map(|s| test_auction.minimum_bid_in(s))
            .filter_map(|b| b.level())
            .min();

        let Some(min_level) = min_level else {
            return vec![];
        };

        let min_combined_points = SUITED_POINTS[min_level as usize - 1];
        vec![HandConstraint::MinHcp(hcp_needed_to_reach(
            model,
            min_combined_points,
        ))]
    }
}

#[derive(Debug)]
pub struct ShowBetterContractIsRemote;
impl Shows for ShowBetterContractIsRemote {
    fn show(&self, model: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Call::Pass = call {
            let partner_max_hcp = model.partner_hand().max_hcp.unwrap_or(0); // Should be Some due to Predicate
            let our_partnership = model.auction.current_partnership();
            let contract = if let Some(c) = model.auction.current_contract() {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::AuctionModel;
    use types::{Call, Position, Suit};

    #[test]
    fn test_show_min_length_in_unbid_majors() {
        let auction = types::Auction::bidding(Position::North, "1C 1D");
        let model = AuctionModel::from_auction(&auction);
        let show = ShowMinLengthInUnbidMajors(4);
        let call = Call::Double;
        let constraints = show.show(&model, &call);

        // Both majors are unbid
        assert_eq!(constraints.len(), 2);
        assert!(constraints.contains(&HandConstraint::MinLength(Suit::Hearts, 4)));
        assert!(constraints.contains(&HandConstraint::MinLength(Suit::Spades, 4)));
    }

    #[test]
    fn test_show_sufficient_values_no_level() {
        let auction = types::Auction::new(Position::North);
        let model = AuctionModel::from_auction(&auction);
        let show = ShowSufficientValues;
        let constraints = show.show(&model, &Call::Pass);
        assert!(constraints.is_empty());
    }

    #[test]
    fn test_show_preempt_length_no_level() {
        let show = ShowPreemptLength;
        let model = AuctionModel::from_auction(&types::Auction::new(Position::North));
        assert!(show.show(&model, &Call::Pass).is_empty());
    }

    #[test]
    fn test_show_law_of_total_tricks() {
        // Partner overcalled 1S (showing 5+ spades)
        let auction = types::Auction::bidding(Position::North, "1D 1S P");
        let model = AuctionModel::from_auction(&auction);
        let show = ShowLawOfTotalTricks;

        // 2S bid
        let call_2s = Call::Bid {
            level: 2,
            strain: types::Strain::Spades,
        };
        let constraints_2s = show.show(&model, &call_2s);
        // level 2 + 6 = 8. Partner has 5. We need 3.
        assert!(constraints_2s.contains(&HandConstraint::MinLength(Suit::Spades, 3)));

        // 3S bid
        let call_3s = Call::Bid {
            level: 3,
            strain: types::Strain::Spades,
        };
        let constraints_3s = show.show(&model, &call_3s);
        // level 3 + 6 = 9. Partner has 5. We need 4.
        assert!(constraints_3s.contains(&HandConstraint::MinLength(Suit::Spades, 4)));
    }

    #[test]
    fn test_show_min_combined_points_for_partner_minimum_suited_rebid() {
        // Partner overcalled 1S (showing 5+ spades, 8+ HCP)
        let auction = types::Auction::bidding(Position::North, "1D 1S P");
        let model = AuctionModel::from_auction(&auction);
        let show = ShowMinCombinedPointsForPartnerMinimumSuitedRebid;

        // We bid 2H (new suit)
        let call_2h = Call::Bid {
            level: 2,
            strain: types::Strain::Hearts,
        };
        let constraints = show.show(&model, &call_2h);

        // Partner's suit is Spades. 2H is higher than 1S, so minimum bid in Spades after 2H is 2S.
        // 2S requires 19 combined points. Partner has 8. We need 11.
        assert!(constraints.contains(&HandConstraint::MinHcp(11)));

        // We bid 3C (new suit)
        let call_3c = Call::Bid {
            level: 3,
            strain: types::Strain::Clubs,
        };
        let constraints_3c = show.show(&model, &call_3c);
        // Clubs < Spades, so minimum bid in Spades after 3C is 3S.
        // 3S requires 22 combined points. Partner has 8. We need 14.
        assert!(constraints_3c.contains(&HandConstraint::MinHcp(14)));
    }

    #[test]
    fn test_show_min_combined_points_multiple_suits() {
        // Partner bid 1H then 2C (showing 5+H, 4+C, 12+ HCP)
        // 1H P 1S P 2C P
        let auction = types::Auction::bidding(Position::North, "1H P 1S P 2C P");
        let model = AuctionModel::from_auction(&auction);
        let show = ShowMinCombinedPointsForPartnerMinimumSuitedRebid;

        // We bid 2D.
        // Last bid becomes 2D.
        let call_2d = Call::Bid {
            level: 2,
            strain: types::Strain::Diamonds,
        };
        let constraints = show.show(&model, &call_2d);

        // Partner's suits: Hearts, Clubs.
        // After 2D:
        // - min bid in Hearts (H > D): 2H (level 2)
        // - min bid in Clubs (C < D): 3C (level 3)
        // Cheapest is 2H at level 2.
        // SUITED_POINTS[1] (level 2) = 19.
        // Partner has 12 HCP. 19 - 12 = 7.
        assert!(constraints.contains(&HandConstraint::MinHcp(7)));
    }
}
