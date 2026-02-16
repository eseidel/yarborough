use crate::bidding_rule;
use crate::dsl::auction_predicates::{TheyOpened, WeHaveNotBid};
use crate::dsl::call_predicates::{
    not_call, IsJump, IsLevel, IsNotrump, IsPass, IsSuit, OpponentHasNotShownSuit,
};
use crate::dsl::shows::{ShowBalanced, ShowHcpRange, ShowMinHcp, ShowMinSuitLength};

bidding_rule! {
    OneLevelOvercall: "Suited Overcall",
    auction: [TheyOpened, WeHaveNotBid],
    call: [IsLevel(1), IsSuit, OpponentHasNotShownSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(8)]
}

bidding_rule! {
    TwoLevelOvercall: "Suited Overcall",
    auction: [TheyOpened, WeHaveNotBid],
    call: [IsLevel(2), IsSuit, not_call(IsJump), OpponentHasNotShownSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(10)]
}

// TODO: Add honor concentration constraint — most HCP should be in the bid suit.
bidding_rule! {
    WeakJumpOvercall: "Weak Jump Overcall",
    auction: [TheyOpened, WeHaveNotBid],
    call: [IsSuit, IsJump, OpponentHasNotShownSuit],
    shows: [ShowMinSuitLength(6), ShowHcpRange(5, 10)]
}

bidding_rule! {
    OneNotrumpOvercall: "Notrump Overcall",
    auction: [TheyOpened, WeHaveNotBid],
    call: [IsLevel(1), IsNotrump],
    shows: [ShowHcpRange(15, 18), ShowBalanced]
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
        let mut auction = types::Auction::new(Position::North);
        // North opens
        auction.add_call(Call::Bid {
            level: 1,
            strain: opening_strain,
        });
        // East's turn (they want to overcall)
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
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Diamonds,
        });
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
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Diamonds,
        });
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
        // WeHaveNotBid should be false for W since E (partner) already bid
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Diamonds,
        });
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Hearts,
        });
        auction.add_call(Call::Pass);
        let model = AuctionModel::from_auction(&auction);
        let call = Call::Bid {
            level: 1,
            strain: Strain::Spades,
        };
        // OneLevelOvercall should NOT match (WeHaveNotBid is false)
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
}
