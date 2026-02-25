use crate::dsl::annotations::Annotation;
use crate::dsl::auction_predicates::{
    not_auction, BidderHasNotActed, BidderOpened, OpenerBidMajorAtLevel,
    PartnerLastCallHasAnnotation, PartnerOpened, RhoBid,
};
use crate::dsl::call_predicates::{BidderHasShownSuit, IsLevel, IsNewSuit, IsNotrump, IsSuit};
use crate::dsl::shows::{
    ShowHcpRange, ShowMaxHcp, ShowMaxLength, ShowMinHcp, ShowMinLengthInPartnerLastBidSuit,
    ShowMinSuitLength, ShowSemiBalanced, ShowThreeOfTopFiveOrBetter,
};
use crate::rule;

rule! {
    Jacoby2NTResponse: "Jacoby 2NT",
    auction: [PartnerOpened, OpenerBidMajorAtLevel(1), BidderHasNotActed, not_auction(RhoBid)],
    call: [IsLevel(2), IsNotrump],
    shows: [ShowMinHcp(13), ShowMinLengthInPartnerLastBidSuit(4)],
    annotations: [Jacoby2NT]
}

rule! {
    Jacoby2NTRebidNewSuitLevel3: "Jacoby 2NT Rebid New Suit (3-level)",
    auction: [BidderOpened, OpenerBidMajorAtLevel(1), PartnerLastCallHasAnnotation(Annotation::Jacoby2NT), not_auction(RhoBid)],
    call: [IsLevel(3), IsNewSuit],
    shows: [ShowMaxLength(1)], // Singleton or void
    annotations: [ConventionalResponse]
}

rule! {
    Jacoby2NTRebidNewSuitLevel4: "Jacoby 2NT Rebid New Suit (4-level)",
    auction: [BidderOpened, OpenerBidMajorAtLevel(1), PartnerLastCallHasAnnotation(Annotation::Jacoby2NT), not_auction(RhoBid)],
    call: [IsLevel(4), IsNewSuit],
    shows: [ShowMinSuitLength(5), ShowThreeOfTopFiveOrBetter], // 5-card quality side suit
    annotations: [ConventionalResponse]
}

rule! {
    Jacoby2NTRebidMajorLevel3: "Jacoby 2NT Rebid Major (3-level)",
    auction: [BidderOpened, OpenerBidMajorAtLevel(1), PartnerLastCallHasAnnotation(Annotation::Jacoby2NT), not_auction(RhoBid)],
    call: [IsLevel(3), IsSuit, BidderHasShownSuit],
    shows: [ShowMinHcp(15)], // Strong hand (15+ HCP)
    annotations: [ConventionalResponse],
    planner: Jacoby3MajorPlanner
}

rule! {
    Jacoby2NTRebidMajorLevel4: "Jacoby 2NT Rebid Major (4-level)",
    auction: [BidderOpened, OpenerBidMajorAtLevel(1), PartnerLastCallHasAnnotation(Annotation::Jacoby2NT), not_auction(RhoBid)],
    call: [IsLevel(4), IsSuit, BidderHasShownSuit],
    shows: [ShowMaxHcp(14)], // Minimum hand (12-14 HCP)
    annotations: [ConventionalResponse]
}

rule! {
    Jacoby2NTRebid3NT: "Jacoby 2NT Rebid 3NT",
    auction: [BidderOpened, OpenerBidMajorAtLevel(1), PartnerLastCallHasAnnotation(Annotation::Jacoby2NT), not_auction(RhoBid)],
    call: [IsLevel(3), IsNotrump],
    shows: [ShowHcpRange(15, 17), ShowSemiBalanced], // Balanced minimum/middle, no singleton/void
    annotations: [ConventionalResponse]
}

#[derive(Debug)]
pub struct Jacoby3MajorPlanner;

impl crate::dsl::planner::Planner for Jacoby3MajorPlanner {
    fn applies(
        &self,
        _auction: &crate::kernel::AuctionModel,
        hand: &types::Hand,
        _call: &types::Call,
        shows: &[crate::kernel::HandConstraint],
    ) -> bool {
        for constraint in shows {
            if !constraint.check(hand) {
                return false;
            }
        }

        // If 15-17 AND SemiBalanced or Balanced, we should bid 3NT instead
        if hand.hcp() <= 17
            && (hand.shape() == types::Shape::Balanced
                || hand.shape() == types::Shape::SemiBalanced)
        {
            return false;
        }

        true
    }
}
