use crate::dsl::annotations::Annotation;
use crate::dsl::auction_predicates::{
    not_auction, BidderHasNotActed, OpenerBidMajorAtLevel, PartnerLastCallHasAnnotation,
    PartnerOpened, RhoBid,
};
use crate::dsl::call_predicates::{BidderHasShownSuit, IsLevel, IsNewSuit, IsNotrump, IsSuit};
use crate::dsl::shows::{
    ShowHcpRange, ShowMaxLength, ShowMinHcp, ShowMinLengthInPartnerLastBidSuit, ShowMinSuitLength,
    ShowSemiBalanced, ShowThreeOfTopFiveOrBetter,
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
    SingletonResponseToJacoby2NT: "Singleton Response to Jacoby 2NT",
    auction: [PartnerLastCallHasAnnotation(Annotation::Jacoby2NT), not_auction(RhoBid)],
    call: [IsLevel(3), IsNewSuit],
    shows: [ShowMaxLength(1)],
    annotations: [ConventionalResponse]
}

rule! {
    SolidSuitResponseToJacoby2NT: "Solid Suit Response to Jacoby 2NT",
    auction: [PartnerLastCallHasAnnotation(Annotation::Jacoby2NT), not_auction(RhoBid)],
    call: [IsLevel(4), IsNewSuit],
    shows: [ShowMinSuitLength(5), ShowThreeOfTopFiveOrBetter],
    annotations: [ConventionalResponse]
}

rule! {
    SlamResponseToJacoby2NT: "Slam Response to Jacoby 2NT",
    auction: [PartnerLastCallHasAnnotation(Annotation::Jacoby2NT), not_auction(RhoBid)],
    call: [IsLevel(3), IsSuit, BidderHasShownSuit],
    shows: [ShowMinHcp(18)],
    annotations: [ConventionalResponse],
}

rule! {
    MinimumResponseToJacoby2NT: "Minimum Response to Jacoby 2NT",
    auction: [PartnerLastCallHasAnnotation(Annotation::Jacoby2NT), not_auction(RhoBid)],
    call: [IsLevel(4), IsSuit, BidderHasShownSuit],
    shows: [],
    annotations: [ConventionalResponse],
}

rule! {
    NotrumpResponseToJacoby2NT: "Notrump Response to Jacoby 2NT",
    auction: [PartnerLastCallHasAnnotation(Annotation::Jacoby2NT), not_auction(RhoBid)],
    call: [IsLevel(3), IsNotrump],
    shows: [ShowHcpRange(16, 17), ShowSemiBalanced],
    annotations: [ConventionalResponse],
}
