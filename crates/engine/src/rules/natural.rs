use crate::dsl::auction_predicates::{
    not_auction, BidderOpened, OpenerBidMinor, PartnerLimited, TheyHaveBid, WeOpened,
};
use crate::dsl::call_predicates::{
    not_call, BidderHasShownSuit, IsGameLevelOrBelow, IsJump, IsLevel, IsMajorSuit,
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
    auction: [WeOpened, not_auction(TheyHaveBid)],
    call: [IsLevel(1), IsNewSuit],
    shows: [ShowMinSuitLength(4), ShowMinHcp(6)]
}

rule! {
    FreeBidAtLevelOne: "Free Bid (New Suit)",
    auction: [WeOpened, TheyHaveBid],
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
    JumpShiftResponse: "Jump Shift Response",
    auction: [WeOpened],
    call: [IsJump, IsNewSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(19)]
}

rule! {
    TwoNotrumpJumpRebid: "2NT Jump Rebid",
    auction: [BidderOpened, OpenerBidMinor],
    call: [IsLevel(2), IsNotrump, IsJump],
    shows: [ShowHcpRange(18, 19), ShowBalanced],
    annotations: [NotrumpSystemsOn]
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
        assert!(sem
            .annotations
            .contains(&crate::dsl::annotations::Annotation::NotrumpSystemsOn));
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
}
