use crate::dsl::auction_predicates::{
    BidderHasNotActed, HasUnbidMajor, LastBidIsSuit, LastBidLevelRange, LastBidMaxLevel,
    PartnerOvercalled, RhoMadeLastBid, TheyOpened, WeHaveNotActed, WeOpened,
};
use crate::dsl::call_predicates::{
    not_call, IsDouble, IsJump, IsLevel, IsLevelRange, IsNewSuit, IsNotrump, IsPass, IsSuit,
    MaxLevel, OpponentHasNotShownSuit, PartnerHasShownSuit,
};
use crate::dsl::planner::TakeoutDoublePlanner;
use crate::dsl::shows::{
    ShowBalanced, ShowHcpRange, ShowLawOfTotalTricks,
    ShowMinCombinedPointsForPartnerMinimumSuitedRebid, ShowMinHcp, ShowMinLengthInUnbidMajors,
    ShowMinSuitLength, ShowPreemptLength, ShowSemiBalanced, ShowStopperInOpponentSuit,
    ShowSufficientValues, ShowSupportForUnbidSuits, ShowThreeOfTopFiveOrBetter,
};
use crate::rule;

rule! {
    OneLevelOvercall: "Suited Overcall",
    auction: [TheyOpened, WeHaveNotActed],
    call: [IsLevel(1), IsSuit, OpponentHasNotShownSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(8), ShowThreeOfTopFiveOrBetter],
    annotations: [Overcall]
}

rule! {
    TwoLevelOvercall: "Suited Overcall",
    auction: [TheyOpened, WeHaveNotActed],
    call: [IsLevel(2), IsSuit, not_call(IsJump), OpponentHasNotShownSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(10), ShowThreeOfTopFiveOrBetter],
    annotations: [Overcall]
}

rule! {
    WeakJumpOvercall: "Weak Jump Overcall",
    auction: [TheyOpened, WeHaveNotActed],
    call: [IsSuit, IsJump, MaxLevel(4), OpponentHasNotShownSuit],
    shows: [ShowPreemptLength, ShowHcpRange(5, 10), ShowThreeOfTopFiveOrBetter],
    annotations: [Overcall]
}

rule! {
    OneNotrumpOvercall: "Notrump Overcall",
    auction: [TheyOpened, WeHaveNotActed],
    call: [IsLevel(1), IsNotrump],
    shows: [ShowHcpRange(15, 18), ShowBalanced, ShowStopperInOpponentSuit],
    annotations: [NotrumpSystemsOn]
}

rule! {
    OneLevelTakeoutDouble: "Takeout Double",
    auction: [TheyOpened, WeHaveNotActed, RhoMadeLastBid, LastBidMaxLevel(1)],
    call: [IsDouble],
    shows: [ShowMinHcp(11), ShowSupportForUnbidSuits],
    planner: TakeoutDoublePlanner
}

rule! {
    OneLevelNegativeDouble: "Negative Double",
    auction: [WeOpened, BidderHasNotActed, RhoMadeLastBid, LastBidMaxLevel(1), HasUnbidMajor, LastBidIsSuit],
    call: [IsDouble],
    shows: [ShowMinHcp(6), ShowMinLengthInUnbidMajors(4)]
}

rule! {
    TwoLevelNegativeDouble: "Negative Double",
    auction: [WeOpened, BidderHasNotActed, RhoMadeLastBid, LastBidLevelRange(2, 3), HasUnbidMajor, LastBidIsSuit],
    call: [IsDouble],
    shows: [ShowMinHcp(8), ShowMinLengthInUnbidMajors(4)]
}

rule! {
    PassOvercall: "Pass (Overcall)",
    auction: [TheyOpened],
    call: [IsPass],
    shows: []
}

rule! {
    RaiseResponseToOvercall: "Raise Response to Overcall",
    auction: [PartnerOvercalled, BidderHasNotActed],
    call: [PartnerHasShownSuit, IsLevelRange(2, 3), not_call(IsJump)],
    shows: [ShowLawOfTotalTricks, ShowMinHcp(6)]
}

rule! {
    NewSuitResponseToOvercall: "New Suit Response to Overcall",
    auction: [PartnerOvercalled, BidderHasNotActed],
    call: [IsNewSuit, MaxLevel(3), not_call(IsJump)],
    shows: [
        ShowMinSuitLength(5),
        ShowMinCombinedPointsForPartnerMinimumSuitedRebid,
        ShowThreeOfTopFiveOrBetter,
    ]
}

rule! {
    NotrumpResponseToOvercall: "Notrump Response to Overcall",
    auction: [PartnerOvercalled, BidderHasNotActed],
    call: [IsNotrump],
    shows: [ShowSemiBalanced, ShowStopperInOpponentSuit, ShowSufficientValues]
}

rule! {
    PassAdvance: "Pass (Advance)",
    auction: [PartnerOvercalled],
    call: [IsPass],
    shows: []
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dsl::rule::Rule;
    use crate::kernel::{AuctionModel, HandConstraint};
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
        assert!(sem
            .shows
            .contains(&HandConstraint::ThreeOfTopFiveOrBetter(Suit::Hearts)));
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
        assert!(sem
            .shows
            .contains(&HandConstraint::ThreeOfTopFiveOrBetter(Suit::Hearts)));
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
        use crate::kernel;
        // Hand format is C.D.H.S
        // 3 clubs, 2 diamonds, 3 hearts, 5 spades = KQ752 in spades, 10 HCP
        let hand = Hand::parse("AJ4.73.T86.KQ752");
        let auction = types::Auction::bidding(Position::North, "1D");
        // East's turn to overcall
        let bid = kernel::select_call(&hand, &auction);
        // Should bid 1S (5 spades, 10 HCP, good suit quality)
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
        use crate::kernel;
        // Hand format is C.D.H.S: 2 clubs, 5 diamonds, 3 hearts, 3 spades
        let hand = Hand::parse("K6.AQT43.KT4.543");
        let auction = types::Auction::bidding(Position::North, "1D");
        // East should pass - only long suit is diamonds (opponent's suit)
        let bid = kernel::select_call(&hand, &auction);
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
        assert!(sem
            .shows
            .contains(&HandConstraint::ThreeOfTopFiveOrBetter(Suit::Hearts)));
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
        // WeHaveNotActed should be false for W since E (partner) already bid
        let auction = types::Auction::bidding(Position::North, "1D 1H P");
        let model = AuctionModel::from_auction(&auction);
        let call = Call::Bid {
            level: 1,
            strain: Strain::Spades,
        };
        // OneLevelOvercall should NOT match (WeHaveNotActed is false)
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
        // WeHaveNotActed should be false for W since E (partner) already bid
        let auction = types::Auction::bidding(Position::North, "1D 1H P");
        let model = AuctionModel::from_auction(&auction);
        assert!(OneLevelTakeoutDouble
            .get_semantics(&model, &Call::Double)
            .is_none());
    }

    #[test]
    fn test_takeout_double_strong_hand() {
        use crate::kernel;
        // Hand format is C.D.H.S: 6 clubs, 3 diamonds, 2 hearts, 2 spades
        // 18 HCP — should double despite lacking shape (strong hand override)
        let hand = Hand::parse("AKQ982.AQ5.K7.43");
        let auction = types::Auction::bidding(Position::North, "1H");
        let bid = kernel::select_call(&hand, &auction);
        assert_eq!(
            bid,
            Some(Call::Double),
            "18 HCP should double regardless of shape"
        );
    }

    #[test]
    fn test_takeout_double_integration() {
        use crate::kernel;
        // Hand format is C.D.H.S: 1 club, 4 diamonds, 4 hearts, 4 spades
        // Classic 4-4-4-1 takeout double shape, 13 HCP
        let hand = Hand::parse("A.KJ63.AQ54.K854");
        let auction = types::Auction::bidding(Position::North, "1C");
        let bid = kernel::select_call(&hand, &auction);
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
        use crate::kernel;
        // Hand format is C.D.H.S: 5 clubs, 4 diamonds, 2 hearts, 2 spades
        // 12 HCP but lacks support for unbid majors — should not double
        let hand = Hand::parse("AKJ74.QJ62.85.93");
        let auction = types::Auction::bidding(Position::North, "1H");
        let bid = kernel::select_call(&hand, &auction);
        assert_ne!(
            bid,
            Some(Call::Double),
            "Should not double without support for unbid suits"
        );
    }

    // --- Negative Double tests ---

    #[test]
    fn test_negative_double_after_one_level_overcall() {
        // N opens 1C, E overcalls 1S, S's turn
        // Negative double should show 4+ hearts (unbid major), 6+ HCP
        let auction = types::Auction::bidding(Position::North, "1C 1S");
        let model = AuctionModel::from_auction(&auction);
        let sem = OneLevelNegativeDouble
            .get_semantics(&model, &Call::Double)
            .unwrap();

        assert!(sem.shows.contains(&HandConstraint::MinHcp(6)));
        // Hearts is the only unbid major (spades shown by opponent)
        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Hearts, 4)));
        assert!(!sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 4)));
    }

    #[test]
    fn test_negative_double_shows_both_majors() {
        // N opens 1C, E overcalls 1D, S's turn
        // Both majors are unbid
        let auction = types::Auction::bidding(Position::North, "1C 1D");
        let model = AuctionModel::from_auction(&auction);
        let sem = OneLevelNegativeDouble
            .get_semantics(&model, &Call::Double)
            .unwrap();

        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Hearts, 4)));
        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 4)));
    }

    #[test]
    fn test_negative_double_not_when_they_opened() {
        // They opened, we didn't — should not match (that's a takeout double)
        let auction = types::Auction::bidding(Position::North, "1C");
        let model = AuctionModel::from_auction(&auction);
        assert!(OneLevelNegativeDouble
            .get_semantics(&model, &Call::Double)
            .is_none());
    }

    #[test]
    fn test_negative_double_not_when_opener_rebids() {
        // N: 1C, E: 1S, S: P, W: P, N's turn again
        // N already bid 1C, so BidderHasNotActed is false
        let auction = types::Auction::bidding(Position::North, "1C 1S P P");
        let model = AuctionModel::from_auction(&auction);
        assert!(
            OneLevelNegativeDouble
                .get_semantics(&model, &Call::Double)
                .is_none(),
            "Opener should not match negative double rule"
        );
    }

    #[test]
    fn test_negative_double_not_over_nt_overcall() {
        // N: 1C, E: 1N, S's turn — double of 1NT should be penalty, not negative
        let auction = types::Auction::bidding(Position::North, "1C 1N");
        let model = AuctionModel::from_auction(&auction);
        assert!(
            OneLevelNegativeDouble
                .get_semantics(&model, &Call::Double)
                .is_none(),
            "Should not make negative double over NT overcall"
        );
    }

    #[test]
    fn test_negative_double_not_when_both_majors_shown() {
        // N: 1H, E: 2S, S's turn — both majors shown, HasUnbidMajor is false
        let auction = types::Auction::bidding(Position::North, "1H 2S");
        let model = AuctionModel::from_auction(&auction);
        assert!(
            TwoLevelNegativeDouble
                .get_semantics(&model, &Call::Double)
                .is_none(),
            "Should not double when no unbid major exists"
        );
    }

    #[test]
    fn test_two_level_negative_double() {
        // N: 1D, E: 2C, S's turn — negative double at 2-level needs 8+ HCP
        let auction = types::Auction::bidding(Position::North, "1D 2C");
        let model = AuctionModel::from_auction(&auction);
        let sem = TwoLevelNegativeDouble
            .get_semantics(&model, &Call::Double)
            .unwrap();

        assert!(sem.shows.contains(&HandConstraint::MinHcp(8)));
        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Hearts, 4)));
        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 4)));
    }

    #[test]
    fn test_negative_double_integration() {
        use crate::kernel;
        // Hand format is C.D.H.S: 4 clubs, 3 diamonds, 4 hearts, 2 spades
        // After 1C-1S, should double to show 4 hearts
        let hand = Hand::parse("9872.K64.K875.63");
        let auction = types::Auction::bidding(Position::North, "1C 1S");
        let bid = kernel::select_call(&hand, &auction);
        assert_eq!(
            bid,
            Some(Call::Double),
            "Should negative double with 4 hearts after 1C-1S"
        );
    }

    #[test]
    fn test_negative_double_prefers_suit_with_five() {
        use crate::kernel;
        // Hand format is C.D.H.S: 2 clubs, 3 diamonds, 3 hearts, 5 spades
        // After 1C-1H, with 5 spades should bid 1S, not double
        let hand = Hand::parse("32.432.432.AKQJ2");
        let auction = types::Auction::bidding(Position::North, "1C 1H");
        let bid = kernel::select_call(&hand, &auction);
        assert_eq!(
            bid,
            Some(Call::Bid {
                level: 1,
                strain: Strain::Spades
            }),
            "Should bid 1S with 5 spades, not double"
        );
    }

    // --- Advance tests ---

    #[test]
    fn test_raise_partner_overcall_semantics() {
        // N: 1D, E: 1S, S: P, W's turn — raise partner's 1S overcall
        let auction = types::Auction::bidding(Position::North, "1D 1S P");
        let model = AuctionModel::from_auction(&auction);
        let call = Call::Bid {
            level: 2,
            strain: Strain::Spades,
        };
        let sem = RaiseResponseToOvercall
            .get_semantics(&model, &call)
            .expect("Should match raise of partner's overcall suit");

        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 3)));
    }

    #[test]
    fn test_raise_not_when_partner_opened() {
        // N: 1S, E: P, S's turn — partner opened, not overcalled
        let auction = types::Auction::bidding(Position::North, "1S P");
        let model = AuctionModel::from_auction(&auction);
        let call = Call::Bid {
            level: 2,
            strain: Strain::Spades,
        };
        assert!(
            RaiseResponseToOvercall
                .get_semantics(&model, &call)
                .is_none(),
            "Should not match when partner opened"
        );
    }

    #[test]
    fn test_new_suit_advance_semantics() {
        // N: 1D, E: 1S, S: P, W bids 2H (new suit)
        let auction = types::Auction::bidding(Position::North, "1D 1S P");
        let model = AuctionModel::from_auction(&auction);
        let call = Call::Bid {
            level: 2,
            strain: Strain::Hearts,
        };
        let sem = NewSuitResponseToOvercall
            .get_semantics(&model, &call)
            .expect("Should match new suit advance");

        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Hearts, 5)));
        assert!(sem.shows.contains(&HandConstraint::MinHcp(11)));
    }

    #[test]
    fn test_notrump_advance_semantics() {
        // N: 1D, E: 1S, S: P, W bids 1NT
        let auction = types::Auction::bidding(Position::North, "1D 1S P");
        let model = AuctionModel::from_auction(&auction);
        let call = Call::Bid {
            level: 1,
            strain: Strain::Notrump,
        };
        let sem = NotrumpResponseToOvercall
            .get_semantics(&model, &call)
            .expect("Should match NT advance");

        // Should require stopper in opponent's suit (diamonds)
        assert!(sem
            .shows
            .contains(&HandConstraint::StopperIn(Suit::Diamonds)));
    }

    #[test]
    fn test_pass_advance() {
        // N: 1D, E: 1S, S: P, W passes
        let auction = types::Auction::bidding(Position::North, "1D 1S P");
        let model = AuctionModel::from_auction(&auction);
        let sem = PassAdvance
            .get_semantics(&model, &Call::Pass)
            .expect("Should match pass advance");
        assert!(sem.shows.is_empty());
    }

    #[test]
    fn test_raise_integration() {
        use crate::kernel;
        // Hand format is C.D.H.S: 3 clubs, 3 diamonds, 3 hearts, 4 spades
        // After 1D-1S-P, West has 4-card spade support and 13 HCP — should raise
        let hand = Hand::parse("AQ4.K64.J82.KT95");
        let auction = types::Auction::bidding(Position::North, "1D 1S P");
        let bid = kernel::select_call(&hand, &auction);
        assert_eq!(
            bid,
            Some(Call::Bid {
                level: 2,
                strain: Strain::Spades
            }),
            "Should raise partner's 1S overcall with 4-card support"
        );
    }

    #[test]
    fn test_new_suit_advance_integration() {
        use crate::kernel;
        // Hand format is C.D.H.S: 3 clubs, 3 diamonds, 5 hearts, 2 spades
        // After 1C-1S-P, West has 5 hearts, 13 HCP, only 2 spades — should bid 2H
        let hand = Hand::parse("932.K64.AKJ72.Q8");
        let auction = types::Auction::bidding(Position::North, "1C 1S P");
        let bid = kernel::select_call(&hand, &auction);
        assert_eq!(
            bid,
            Some(Call::Bid {
                level: 2,
                strain: Strain::Hearts
            }),
            "Should advance with new suit 2H with 5 hearts and 13 HCP"
        );
    }
}
