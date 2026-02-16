use crate::bidding_rule;
use crate::dsl::auction_predicates::{
    LastBidMaxLevel, RhoMadeLastBid, TheyOpened, WeHaveOnlyPassed,
};
use crate::dsl::call_predicates::{
    not_call, IsDouble, IsJump, IsLevel, IsNotrump, IsPass, IsSuit, MaxLevel,
    OpponentHasNotShownSuit,
};
use crate::dsl::planner::TakeoutDoublePlanner;
use crate::dsl::shows::{
    ShowBalanced, ShowHcpRange, ShowMinHcp, ShowMinSuitLength, ShowPreemptLength,
    ShowStopperInOpponentSuit, ShowSupportForUnbidSuits,
};

bidding_rule! {
    OneLevelOvercall: "Suited Overcall",
    auction: [TheyOpened, WeHaveOnlyPassed],
    call: [IsLevel(1), IsSuit, OpponentHasNotShownSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(8)]
}

bidding_rule! {
    TwoLevelOvercall: "Suited Overcall",
    auction: [TheyOpened, WeHaveOnlyPassed],
    call: [IsLevel(2), IsSuit, not_call(IsJump), OpponentHasNotShownSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(10)]
}

// TODO: Add honor concentration constraint — most HCP should be in the bid suit.
bidding_rule! {
    WeakJumpOvercall: "Weak Jump Overcall",
    auction: [TheyOpened, WeHaveOnlyPassed],
    call: [IsSuit, IsJump, MaxLevel(4), OpponentHasNotShownSuit],
    shows: [ShowPreemptLength, ShowHcpRange(5, 10)]
}

bidding_rule! {
    OneNotrumpOvercall: "Notrump Overcall",
    auction: [TheyOpened, WeHaveOnlyPassed],
    call: [IsLevel(1), IsNotrump],
    shows: [ShowHcpRange(15, 18), ShowBalanced, ShowStopperInOpponentSuit]
}

bidding_rule! {
    OneLevelTakeoutDouble: "Takeout Double",
    auction: [TheyOpened, WeHaveOnlyPassed, RhoMadeLastBid, LastBidMaxLevel(1)],
    call: [IsDouble],
    shows: [ShowMinHcp(11), ShowSupportForUnbidSuits],
    planner: TakeoutDoublePlanner
}

bidding_rule! {
    PassOvercall: "Pass (Overcall)",
    auction: [TheyOpened],
    call: [IsPass],
    shows: []
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dsl::bidding_rule::BiddingRule;
    use crate::nbk::{AuctionModel, HandConstraint};
    use types::{Call, Hand, Position, Strain, Suit};

    fn make_overcall_auction(opening_strain: Strain) -> AuctionModel {
        let call = format!("1{}", opening_strain.to_char());
        let auction = types::Auction::bidding(Position::North, &call);
        AuctionModel::from_auction(&auction)
    }

    #[test]
    fn test_one_level_overcall() {
        let model = make_overcall_auction(Strain::Clubs);
        let call = Call::Bid {
            level: 1,
            strain: Strain::Hearts,
        };
        let sem = OneLevelOvercall.get_semantics(&model, &call).unwrap();

        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Hearts, 5)));
        assert!(sem.shows.contains(&HandConstraint::MinHcp(8)));
    }

    #[test]
    fn test_one_level_overcall_not_when_we_opened() {
        // We opened, not them
        let auction = types::Auction::new(Position::North);
        let model = AuctionModel::from_auction(&auction);
        let call = Call::Bid {
            level: 1,
            strain: Strain::Hearts,
        };
        assert!(OneLevelOvercall.get_semantics(&model, &call).is_none());
    }

    #[test]
    fn test_two_level_overcall() {
        let model = make_overcall_auction(Strain::Spades);
        let call = Call::Bid {
            level: 2,
            strain: Strain::Hearts,
        };
        let sem = TwoLevelOvercall.get_semantics(&model, &call).unwrap();

        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Hearts, 5)));
        assert!(sem.shows.contains(&HandConstraint::MinHcp(10)));
    }

    #[test]
    fn test_one_nt_overcall() {
        let model = make_overcall_auction(Strain::Clubs);
        let call = Call::Bid {
            level: 1,
            strain: Strain::Notrump,
        };
        let sem = OneNotrumpOvercall.get_semantics(&model, &call).unwrap();

        assert!(sem.shows.contains(&HandConstraint::MinHcp(15)));
        assert!(sem.shows.contains(&HandConstraint::MaxHcp(18)));
    }

    #[test]
    fn test_pass_overcall() {
        let model = make_overcall_auction(Strain::Clubs);
        let sem = PassOvercall.get_semantics(&model, &Call::Pass).unwrap();

        assert!(sem.shows.is_empty());
    }

    #[test]
    fn test_overcall_selects_correct_suit() {
        use crate::nbk;
        // Hand format is C.D.H.S
        // 3 clubs, 2 diamonds, 3 hearts, 5 spades = AK975 in spades, 10 HCP
        let hand = Hand::parse("A94.73.AT6.QT752");
        let auction = types::Auction::bidding(Position::North, "1D");
        // East's turn to overcall
        let bid = nbk::select_bid(&hand, &auction);
        // Should bid 1S (5 spades, 10 HCP)
        assert_eq!(
            bid,
            Some(Call::Bid {
                level: 1,
                strain: Strain::Spades
            }),
            "Should overcall 1S with 5 spades and 10 HCP"
        );
    }

    #[test]
    fn test_overcall_avoids_opponent_suit() {
        use crate::nbk;
        // Hand format is C.D.H.S: 2 clubs, 5 diamonds, 3 hearts, 3 spades
        let hand = Hand::parse("K6.AQT43.KT4.543");
        let auction = types::Auction::bidding(Position::North, "1D");
        // East should pass - only long suit is diamonds (opponent's suit)
        let bid = nbk::select_bid(&hand, &auction);
        assert_eq!(
            bid,
            Some(Call::Pass),
            "Should pass when only long suit is opponent's"
        );
    }

    #[test]
    fn test_two_level_overcall_rejects_jump() {
        // Over 1C, 2H is a jump (minimum for hearts is 1H)
        let model = make_overcall_auction(Strain::Clubs);
        let call = Call::Bid {
            level: 2,
            strain: Strain::Hearts,
        };
        // TwoLevelOvercall requires not_call(IsJump), so this should be None
        assert!(TwoLevelOvercall.get_semantics(&model, &call).is_none());
    }

    #[test]
    fn test_two_level_overcall_non_jump() {
        // Over 1S, 2H is NOT a jump (minimum for hearts is 2H)
        let model = make_overcall_auction(Strain::Spades);
        let call = Call::Bid {
            level: 2,
            strain: Strain::Hearts,
        };
        assert!(TwoLevelOvercall.get_semantics(&model, &call).is_some());
    }

    #[test]
    fn test_weak_jump_overcall() {
        // Over 1C, 2H is a jump overcall
        let model = make_overcall_auction(Strain::Clubs);
        let call = Call::Bid {
            level: 2,
            strain: Strain::Hearts,
        };
        let sem = WeakJumpOvercall.get_semantics(&model, &call).unwrap();
        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Hearts, 6)));
        assert!(sem.shows.contains(&HandConstraint::MinHcp(5)));
        assert!(sem.shows.contains(&HandConstraint::MaxHcp(10)));
    }

    #[test]
    fn test_weak_jump_overcall_not_non_jump() {
        // Over 1S, 2H is NOT a jump — WeakJumpOvercall should not match
        let model = make_overcall_auction(Strain::Spades);
        let call = Call::Bid {
            level: 2,
            strain: Strain::Hearts,
        };
        assert!(WeakJumpOvercall.get_semantics(&model, &call).is_none());
    }

    #[test]
    fn test_overcall_blocked_when_partner_has_bid() {
        // N opens 1D, E overcalls 1H, S passes, W's turn
        // WeHaveOnlyPassed should be false for W since E (partner) already bid
        let auction = types::Auction::bidding(Position::North, "1D 1H P");
        let model = AuctionModel::from_auction(&auction);
        let call = Call::Bid {
            level: 1,
            strain: Strain::Spades,
        };
        // OneLevelOvercall should NOT match (WeHaveOnlyPassed is false)
        assert!(OneLevelOvercall.get_semantics(&model, &call).is_none());
    }

    #[test]
    fn test_opponent_model_tracks_shown_suits() {
        // N opens 1S — from East's perspective, RHO (North) has shown spades
        let model = make_overcall_auction(Strain::Spades);
        assert!(
            model.rho_hand().has_shown_suit(Suit::Spades),
            "RHO should have shown spades after opening 1S"
        );
        assert!(
            !model.rho_hand().has_shown_suit(Suit::Hearts),
            "RHO should not have shown hearts"
        );
    }

    #[test]
    fn test_opponent_shown_suit_blocks_overcall() {
        // N opens 1S — OpponentHasNotShownSuit should block overcalling in spades
        let model = make_overcall_auction(Strain::Spades);
        let call = Call::Bid {
            level: 2,
            strain: Strain::Spades,
        };
        // This is a cuebid in opponent's suit — should not match simple overcall
        assert!(TwoLevelOvercall.get_semantics(&model, &call).is_none());
    }

    #[test]
    fn test_takeout_double_basic() {
        // N opens 1C, East doubles — should show 3+ in D, H, S (the unbid suits)
        let model = make_overcall_auction(Strain::Clubs);
        let sem = OneLevelTakeoutDouble
            .get_semantics(&model, &Call::Double)
            .unwrap();

        assert!(sem.shows.contains(&HandConstraint::MinHcp(11)));
        // Clubs was shown by opponent, so 3 unbid suits should have MinLength
        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Diamonds, 3)));
        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Hearts, 3)));
        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 3)));
        // Should NOT show clubs (opponent's suit)
        assert!(!sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Clubs, 3)));
    }

    #[test]
    fn test_takeout_double_not_when_we_opened() {
        // We opened, not them — no takeout double available
        let auction = types::Auction::new(Position::North);
        let model = AuctionModel::from_auction(&auction);
        assert!(OneLevelTakeoutDouble
            .get_semantics(&model, &Call::Double)
            .is_none());
    }

    #[test]
    fn test_takeout_double_not_when_partner_bid() {
        // N opens 1D, E overcalls 1H, S passes, W's turn
        // WeHaveOnlyPassed should be false for W since E (partner) already bid
        let auction = types::Auction::bidding(Position::North, "1D 1H P");
        let model = AuctionModel::from_auction(&auction);
        assert!(OneLevelTakeoutDouble
            .get_semantics(&model, &Call::Double)
            .is_none());
    }

    #[test]
    fn test_takeout_double_strong_hand() {
        use crate::nbk;
        // Hand format is C.D.H.S: 6 clubs, 3 diamonds, 2 hearts, 2 spades
        // 18 HCP — should double despite lacking shape (strong hand override)
        let hand = Hand::parse("AKQ982.AQ5.K7.43");
        let auction = types::Auction::bidding(Position::North, "1H");
        let bid = nbk::select_bid(&hand, &auction);
        assert_eq!(
            bid,
            Some(Call::Double),
            "18 HCP should double regardless of shape"
        );
    }

    #[test]
    fn test_takeout_double_integration() {
        use crate::nbk;
        // Hand format is C.D.H.S: 1 club, 4 diamonds, 4 hearts, 4 spades
        // Classic 4-4-4-1 takeout double shape, 13 HCP
        let hand = Hand::parse("A.KJ63.AQ54.K854");
        let auction = types::Auction::bidding(Position::North, "1C");
        let bid = nbk::select_bid(&hand, &auction);
        assert_eq!(
            bid,
            Some(Call::Double),
            "4-4-4-1 with 13 HCP should make takeout double"
        );
    }

    #[test]
    fn test_takeout_double_not_in_balancing_seat() {
        // N: 1S, E: P, S: P, W's turn — balancing seat, not direct seat
        let auction = types::Auction::bidding(Position::North, "1S P P");
        let model = AuctionModel::from_auction(&auction);
        assert!(
            OneLevelTakeoutDouble
                .get_semantics(&model, &Call::Double)
                .is_none(),
            "Should not match in balancing seat"
        );
    }

    #[test]
    fn test_no_takeout_double_without_shape_or_strength() {
        use crate::nbk;
        // Hand format is C.D.H.S: 5 clubs, 4 diamonds, 2 hearts, 2 spades
        // 12 HCP but lacks support for unbid majors — should not double
        let hand = Hand::parse("AKJ74.QJ62.85.93");
        let auction = types::Auction::bidding(Position::North, "1H");
        let bid = nbk::select_bid(&hand, &auction);
        assert_ne!(
            bid,
            Some(Call::Double),
            "Should not double without support for unbid suits"
        );
    }
}
