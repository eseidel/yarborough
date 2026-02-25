use crate::dsl::auction_predicates::{
    not_auction, BidderHasNotActed, BidderOpened, OpenerBidMinorAtLevel, PartnerLimited,
    PartnerOpened, RhoBid, WeOpened,
};
use crate::dsl::call_predicates::{
    not_call, BidderHasShownSuit, IsAtLeastJump, IsGameLevelOrBelow, IsJump, IsLevel, IsMajorSuit,
    IsMinLevelForStrain, IsMinorSuit, IsNewSuit, IsNotrump, IsPass, IsSuit, MinLevel,
    PartnerHasShownSuit,
};
use crate::dsl::shows::{
    ShowBalanced, ShowBetterContractIsRemote, ShowHcpRange, ShowMinHcp, ShowMinSuitLength,
    ShowSemiBalanced, ShowSufficientValues, ShowSupportLength, ShowSupportValues,
};
use crate::rule;

rule! {
    NewSuitAtLevelOne: "New Suit",
    auction: [WeOpened, not_auction(RhoBid)],
    call: [IsLevel(1), IsNewSuit],
    shows: [ShowMinSuitLength(4), ShowMinHcp(6)]
}

rule! {
    FreeBidAtLevelOne: "Free Bid (New Suit)",
    auction: [WeOpened, RhoBid],
    call: [IsLevel(1), IsNewSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(8)]
}

rule! {
    OneNotrumpResponse: "1NT Response",
    auction: [WeOpened],
    call: [IsLevel(1), IsNotrump],
    shows: [ShowMinHcp(6)]
}

rule! {
    NewMajorAtLevelTwo: "New Major",
    auction: [WeOpened],
    call: [IsLevel(2), IsMinLevelForStrain, IsNewSuit, IsMajorSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(10)]
}

rule! {
    NewMinorAtLevelTwo: "New Minor",
    auction: [WeOpened],
    call: [IsLevel(2), IsMinLevelForStrain, IsNewSuit, IsMinorSuit],
    shows: [ShowMinSuitLength(4), ShowMinHcp(10)]
}

rule! {
    JumpShift: "Jump Shift",
    auction: [WeOpened],
    call: [IsJump, IsNewSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(19)]
}

rule! {
    TwoNotrumpJumpRebid: "2NT Jump Rebid",
    auction: [BidderOpened, OpenerBidMinorAtLevel(1)],
    call: [IsLevel(2), IsNotrump, IsJump],
    shows: [ShowHcpRange(18, 19), ShowBalanced],
}

rule! {
    TwoNotrumpJumpResponse: "2NT Jump Response",
    auction: [PartnerOpened, OpenerBidMinorAtLevel(1), BidderHasNotActed],
    call: [IsLevel(2), IsNotrump, IsJump],
    shows: [ShowHcpRange(13, 15), ShowBalanced],
}

rule! {
    ThreeNotrumpJumpResponse: "3NT Jump Response",
    auction: [PartnerOpened, OpenerBidMinorAtLevel(1), BidderHasNotActed],
    call: [IsLevel(3), IsNotrump, IsAtLeastJump],
    shows: [ShowMinHcp(16), ShowBalanced],
}

rule! {
    SupportPartner: "Support Partner",
    auction: [WeOpened],
    call: [IsSuit, PartnerHasShownSuit, IsGameLevelOrBelow],
    shows: [ShowSupportLength, ShowSupportValues]
}

rule! {
    NaturalNotrump: "Natural Notrump",
    auction: [WeOpened],
    call: [MinLevel(2), IsNotrump],
    shows: [ShowSemiBalanced, ShowSufficientValues]
}

rule! {
    RebidOwnSuit: "Rebid Suit",
    auction: [WeOpened],
    call: [IsSuit, not_call(PartnerHasShownSuit), BidderHasShownSuit],
    shows: [ShowMinSuitLength(6), ShowSufficientValues]
}

rule! {
    BetterContractRemote: "Pass (Better Contract Remote)",
    auction: [WeOpened, PartnerLimited],
    call: [IsPass],
    shows: [ShowBetterContractIsRemote]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dsl::rule::Rule;
    use crate::kernel::{AuctionModel, HandConstraint};
    use types::{Call, Position, Strain};

    fn make_auction(calls: &str) -> AuctionModel {
        let auction = types::Auction::bidding(Position::North, calls);
        AuctionModel::from_auction(&auction)
    }

    #[test]
    fn test_new_suit_vs_free_bid() {
        // Partner opens 1C, RHO passes. (Uncontested)
        let model_uncontested = make_auction("1C P");
        let call_1s = "1S".parse::<Call>().unwrap();

        // Should match NewSuitAtLevelOne (6+ HCP)
        let sem_u = NewSuitAtLevelOne
            .get_semantics(&model_uncontested, &call_1s)
            .expect("Should match NewSuitAtLevelOne");
        assert!(sem_u.shows.contains(&HandConstraint::MinHcp(6)));
        assert!(FreeBidAtLevelOne
            .get_semantics(&model_uncontested, &call_1s)
            .is_none());

        // Partner opens 1C, RHO bids 1H. (Contested/Free Bid situation)
        let model_contested = make_auction("1C 1H");

        // Should match FreeBidAtLevelOne (8+ HCP)
        let sem_c = FreeBidAtLevelOne
            .get_semantics(&model_contested, &call_1s)
            .expect("Should match FreeBidAtLevelOne");
        assert!(sem_c.shows.contains(&HandConstraint::MinHcp(8)));
        assert!(NewSuitAtLevelOne
            .get_semantics(&model_contested, &call_1s)
            .is_none());

        // Partner opens 1C, RHO bids 1D. (Also a Free Bid situation)
        let model_contested_d = make_auction("1C 1D");
        assert!(FreeBidAtLevelOne
            .get_semantics(&model_contested_d, &call_1s)
            .is_some());
    }

    #[test]
    fn test_support_partner_stops_at_game() {
        // Partner opens 1S. We (South) are supporting.
        let model = make_auction("1S P");

        // 4S is acceptable (it's game level)
        let call_4s = Call::Bid {
            level: 4,
            strain: Strain::Spades,
        };
        assert!(SupportPartner.get_semantics(&model, &call_4s).is_some());

        // 5S is not acceptable (it's above game level)
        let call_5s = Call::Bid {
            level: 5,
            strain: Strain::Spades,
        };
        assert!(SupportPartner.get_semantics(&model, &call_5s).is_none());

        // Partner opens 1D. We (South) are supporting.
        let model_d = make_auction("1D P");

        // 5D is acceptable (it's game level for minors)
        let call_5d = Call::Bid {
            level: 5,
            strain: Strain::Diamonds,
        };
        assert!(SupportPartner.get_semantics(&model_d, &call_5d).is_some());

        // 6D is not acceptable (slam level)
        let call_6d = Call::Bid {
            level: 6,
            strain: Strain::Diamonds,
        };
        assert!(SupportPartner.get_semantics(&model_d, &call_6d).is_none());
    }

    #[test]
    fn test_2nt_jump_response() {
        // North opens 1C.
        let model = make_auction("1C P");

        // South jumps to 2NT.
        let call_2nt = Call::Bid {
            level: 2,
            strain: Strain::Notrump,
        };
        let sem = TwoNotrumpJumpResponse
            .get_semantics(&model, &call_2nt)
            .unwrap();

        assert!(sem.shows.contains(&HandConstraint::MinHcp(13)));
        assert!(sem.shows.contains(&HandConstraint::MaxHcp(15)));
        assert!(sem
            .shows
            .contains(&HandConstraint::MaxUnbalancedness(types::Shape::Balanced)));
    }

    #[test]
    fn test_3nt_jump_response() {
        // North opens 1D.
        let model = make_auction("1D P");

        // South double jumps to 3NT.
        let call_3nt = Call::Bid {
            level: 3,
            strain: Strain::Notrump,
        };
        let sem = ThreeNotrumpJumpResponse
            .get_semantics(&model, &call_3nt)
            .unwrap();

        assert!(sem.shows.contains(&HandConstraint::MinHcp(16)));
        assert!(sem
            .shows
            .contains(&HandConstraint::MaxUnbalancedness(types::Shape::Balanced)));
    }

    #[test]
    fn test_2nt_jump_rebid() {
        // North opens 1C. South bids 1H.
        let model = make_auction("1C P 1H P");

        // North jumps to 2NT.
        let call_2nt = Call::Bid {
            level: 2,
            strain: Strain::Notrump,
        };
        let sem = TwoNotrumpJumpRebid
            .get_semantics(&model, &call_2nt)
            .unwrap();

        assert!(sem.shows.contains(&HandConstraint::MinHcp(18)));
        assert!(sem.shows.contains(&HandConstraint::MaxHcp(19)));
        assert!(sem
            .shows
            .contains(&HandConstraint::MaxUnbalancedness(types::Shape::Balanced)));
    }

    #[test]
    fn test_2nt_rebid_after_major_opening() {
        // North opens 1S. South bids 1NT.
        let model = make_auction("1S P 1N P");

        // 2NT is NOT a jump here (min level for NT is 2).
        // Even if it were a jump, OpenerBidMinor should fail it.
        let call_2nt = Call::Bid {
            level: 2,
            strain: Strain::Notrump,
        };
        assert!(TwoNotrumpJumpRebid
            .get_semantics(&model, &call_2nt)
            .is_none());
    }

    #[test]
    fn test_2nt_response_after_two_level_minor_opening() {
        // Partner opens 2D (e.g., a weak two).
        let model = make_auction("2D P");

        // 3NT is a jump here (min level for NT is 3).
        // But it should not match ThreeNotrumpJumpResponse because opening was level 2.
        let call_3nt = Call::Bid {
            level: 3,
            strain: Strain::Notrump,
        };
        assert!(ThreeNotrumpJumpResponse
            .get_semantics(&model, &call_3nt)
            .is_none());
    }
}
