use crate::bidding_rule;
use crate::dsl::auction_predicates::TheyOpened;
use crate::dsl::call_predicates::{IsCall, IsLevel, IsPass, IsSuit, OpponentHasNotBidSuit};
use crate::dsl::shows::{ShowBalanced, ShowHcpRange, ShowMinHcp, ShowMinSuitLength};
use types::Strain;

bidding_rule! {
    struct OneLevelOvercall;
    name: format!("{level}{strain} Overcall"),
    auction: [TheyOpened],
    call: [IsLevel(1), IsSuit, OpponentHasNotBidSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(8)]
}

bidding_rule! {
    struct TwoLevelOvercall;
    name: format!("{level}{strain} Overcall"),
    auction: [TheyOpened],
    call: [IsLevel(2), IsSuit, OpponentHasNotBidSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(10)]
}

bidding_rule! {
    struct OneNtOvercall;
    name: "1NT Overcall",
    auction: [TheyOpened],
    call: [IsCall(1, Strain::NoTrump)],
    shows: [ShowHcpRange(15, 18), ShowBalanced]
}

bidding_rule! {
    struct PassOvercall;
    name: "Pass (Overcall Position)",
    auction: [TheyOpened],
    call: [IsPass],
    shows: []
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dsl::bidding_rule::BiddingRule;
    use crate::nbk::{AuctionModel, HandConstraint};
    use types::{Call, Position, Strain, Suit};

    fn make_overcall_auction(opening_strain: Strain) -> AuctionModel {
        let mut auction = types::Auction::new(Position::North);
        // North opens
        auction.add_call(Call::Bid {
            level: 1,
            strain: opening_strain,
        });
        // East's turn (they want to overcall)
        AuctionModel::from_auction(&auction, Position::East)
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
        let model = AuctionModel::from_auction(&auction, Position::North);
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
            strain: Strain::NoTrump,
        };
        let sem = OneNtOvercall.get_semantics(&model, &call).unwrap();

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
        use types::io::hand_parser::parse_hand;

        // Hand format is C.D.H.S
        // 3 clubs, 2 diamonds, 3 hearts, 5 spades = AK975 in spades, 10 HCP
        let hand = parse_hand("A94.73.AT6.QT752");
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Diamonds,
        });
        // East's turn to overcall
        let bid = nbk::select_bid(&hand, &auction, Position::East);
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
        use types::io::hand_parser::parse_hand;

        // Hand format is C.D.H.S: 2 clubs, 5 diamonds, 3 hearts, 3 spades
        let hand = parse_hand("K6.AQT43.KT4.543");
        let mut auction = types::Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Diamonds,
        });
        // East should pass - only long suit is diamonds (opponent's suit)
        let bid = nbk::select_bid(&hand, &auction, Position::East);
        assert_eq!(
            bid,
            Some(Call::Pass),
            "Should pass when only long suit is opponent's"
        );
    }
}
