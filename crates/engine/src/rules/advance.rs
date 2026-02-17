use crate::dsl::auction_predicates::{IHaveOnlyPassed, PartnerOvercalled};
use crate::dsl::call_predicates::{IsNewSuit, IsNotrump, IsPass, IsSuit, PartnerHasShownSuit};
use crate::dsl::shows::{
    ShowMinHcp, ShowMinSuitLength, ShowSemiBalanced, ShowStopperInOpponentSuit,
    ShowSufficientValues, ShowSupportLength, ShowSupportValues,
};
use crate::rule;

rule! {
    RaisePartnerOvercall: "Raise Partner's Overcall",
    auction: [PartnerOvercalled, IHaveOnlyPassed],
    call: [IsSuit, PartnerHasShownSuit],
    shows: [ShowSupportLength, ShowSupportValues]
}

rule! {
    NewSuitAdvance: "New Suit (Advance)",
    auction: [PartnerOvercalled, IHaveOnlyPassed],
    call: [IsSuit, IsNewSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(10)]
}

rule! {
    NotrumpAdvance: "Notrump Advance",
    auction: [PartnerOvercalled, IHaveOnlyPassed],
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

    #[test]
    fn test_raise_partner_overcall_semantics() {
        // N: 1D, E: 1S, S: P, W's turn — raise partner's 1S overcall
        let auction = types::Auction::bidding(Position::North, "1D 1S P");
        let model = AuctionModel::from_auction(&auction);
        let call = Call::Bid {
            level: 2,
            strain: Strain::Spades,
        };
        let sem = RaisePartnerOvercall
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
            RaisePartnerOvercall.get_semantics(&model, &call).is_none(),
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
        let sem = NewSuitAdvance
            .get_semantics(&model, &call)
            .expect("Should match new suit advance");

        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Hearts, 5)));
        assert!(sem.shows.contains(&HandConstraint::MinHcp(10)));
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
        let sem = NotrumpAdvance
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
