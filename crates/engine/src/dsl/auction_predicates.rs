use crate::dsl::annotations::Annotation;
use crate::kernel::AuctionModel;
use std::fmt::Debug;
use types::{Call, Suit};

pub trait AuctionPredicate: Send + Sync + Debug {
    fn check(&self, auction: &AuctionModel) -> bool;
}

pub fn not_auction(predicate: impl AuctionPredicate + 'static) -> NotAuction {
    NotAuction(Box::new(predicate))
}

#[derive(Debug)]
pub struct NotAuction(pub Box<dyn AuctionPredicate>);
impl AuctionPredicate for NotAuction {
    fn check(&self, model: &AuctionModel) -> bool {
        !self.0.check(model)
    }
}

#[derive(Debug)]
pub struct IsSeat(pub u8);
impl AuctionPredicate for IsSeat {
    fn check(&self, model: &AuctionModel) -> bool {
        model.auction.current_seat() == self.0
    }
}

#[derive(Debug)]
#[allow(dead_code)]
pub struct IsOpen;
impl AuctionPredicate for IsOpen {
    fn check(&self, model: &AuctionModel) -> bool {
        model.auction.is_open()
    }
}

#[derive(Debug)]
pub struct IsNotOpen;
impl AuctionPredicate for IsNotOpen {
    fn check(&self, model: &AuctionModel) -> bool {
        !model.auction.is_open()
    }
}

#[derive(Debug)]
pub struct PartnerLimited;
impl AuctionPredicate for PartnerLimited {
    fn check(&self, model: &AuctionModel) -> bool {
        model.partner_hand().max_hcp.is_some()
    }
}

#[derive(Debug)]
pub struct WeOpened;
impl AuctionPredicate for WeOpened {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .auction
            .opener()
            .map(|p| p.partnership() == model.auction.current_partnership())
            .unwrap_or(false)
    }
}

#[derive(Debug)]
pub struct TheyOpened;
impl AuctionPredicate for TheyOpened {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .auction
            .opener()
            .map(|p| p.partnership() == model.auction.current_partnership().opponent())
            .unwrap_or(false)
    }
}

/// Checks that RHO made the last bid in the auction.
/// This identifies "direct seat" — we are acting immediately after an opponent's bid.
#[derive(Debug)]
pub struct RhoMadeLastBid;
impl AuctionPredicate for RhoMadeLastBid {
    fn check(&self, model: &AuctionModel) -> bool {
        let rho = model.auction.current_player().rho();
        model.auction.last_bid().map(|(pos, _)| pos) == Some(rho)
    }
}

/// Checks that our partnership has only passed (no bids, doubles, or redoubles).
#[derive(Debug)]
pub struct WeHaveNotActed;
impl AuctionPredicate for WeHaveNotActed {
    fn check(&self, model: &AuctionModel) -> bool {
        let me = model.auction.current_player();
        !model.auction.player_has_acted(me) && !model.auction.player_has_acted(me.partner())
    }
}

/// Checks that the last bid in the auction is at most the given level.
#[derive(Debug)]
pub struct LastBidMaxLevel(pub u8);
impl AuctionPredicate for LastBidMaxLevel {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .auction
            .last_bid()
            .and_then(|(_, call)| call.level())
            .map(|level| level <= self.0)
            .unwrap_or(false)
    }
}

/// Checks that the last bid in the auction is within the given level range (inclusive).
#[derive(Debug)]
pub struct LastBidLevelRange(pub u8, pub u8);
impl AuctionPredicate for LastBidLevelRange {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .auction
            .last_bid()
            .and_then(|(_, call)| call.level())
            .map(|level| level >= self.0 && level <= self.1)
            .unwrap_or(false)
    }
}

/// Checks that the current player (not the whole partnership) has only passed.
/// Unlike `WeHaveNotActed`, this allows partner to have bid.
/// Used for negative doubles: the responder hasn't bid but partner opened.
#[derive(Debug)]
pub struct BidderHasNotActed;
impl AuctionPredicate for BidderHasNotActed {
    fn check(&self, model: &AuctionModel) -> bool {
        !model
            .auction
            .player_has_acted(model.auction.current_player())
    }
}

/// Checks that RHO made a bid/double/redouble (resetting the pass counter).
#[derive(Debug)]
pub struct RhoBid;
impl AuctionPredicate for RhoBid {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .auction
            .rho_last_call()
            .map(|c| !matches!(c, Call::Pass))
            .unwrap_or(false)
    }
}

/// Checks that the current bidder was the one who opened the auction.
#[derive(Debug)]
pub struct BidderOpened;
impl AuctionPredicate for BidderOpened {
    fn check(&self, model: &AuctionModel) -> bool {
        model.auction.opener() == Some(model.auction.current_player())
    }
}

/// Checks that partner was the one who opened the auction.
#[derive(Debug)]
pub struct PartnerOpened;
impl AuctionPredicate for PartnerOpened {
    fn check(&self, model: &AuctionModel) -> bool {
        model.auction.opener() == Some(model.auction.current_player().partner())
    }
}

/// Checks that the opening bid of the auction was in a minor suit at the given level.
#[derive(Debug)]
pub struct OpenerBidMinorAtLevel(pub u8);
impl AuctionPredicate for OpenerBidMinorAtLevel {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .auction
            .iter()
            .find(|(_, call)| call.is_bid())
            .map(|(_, call)| {
                call.level() == Some(self.0) && call.strain().map(|s| s.is_minor()).unwrap_or(false)
            })
            .unwrap_or(false)
    }
}

/// Checks that the opening bid of the auction was in a major suit at the given level.
#[derive(Debug)]
pub struct OpenerBidMajorAtLevel(pub u8);
impl AuctionPredicate for OpenerBidMajorAtLevel {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .auction
            .iter()
            .find(|(_, call)| call.is_bid())
            .map(|(_, call)| {
                call.level() == Some(self.0) && call.strain().map(|s| s.is_major()).unwrap_or(false)
            })
            .unwrap_or(false)
    }
}

/// Checks that partner's last call has the specified annotation.
#[derive(Debug)]
pub struct PartnerLastCallHasAnnotation(pub Annotation);
impl AuctionPredicate for PartnerLastCallHasAnnotation {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .partner_last_call_semantics()
            .map(|s| s.annotations.contains(&self.0))
            .unwrap_or(false)
    }
}

/// Checks that at least one major suit has not been shown by any player.
/// Safety guard ensuring a negative double has an unbid major to show.
#[derive(Debug)]
pub struct HasUnbidMajor;
impl AuctionPredicate for HasUnbidMajor {
    fn check(&self, model: &AuctionModel) -> bool {
        [Suit::Hearts, Suit::Spades].iter().any(|&suit| {
            !model.bidder_hand().has_shown_suit(suit)
                && !model.partner_hand().has_shown_suit(suit)
                && !model.lho_hand().has_shown_suit(suit)
                && !model.rho_hand().has_shown_suit(suit)
        })
    }
}

/// Checks that the last bid in the auction was a suit bid (not NT).
/// Negative doubles apply over suit overcalls, not NT overcalls.
#[derive(Debug)]
pub struct LastBidIsSuit;
impl AuctionPredicate for LastBidIsSuit {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .auction
            .last_bid()
            .map(|(_, call)| call.suit().is_some())
            .unwrap_or(false)
    }
}

/// Checks that partner has made a suited overcall (annotated with `Overcall`).
#[derive(Debug)]
pub struct PartnerOvercalled;
impl AuctionPredicate for PartnerOvercalled {
    fn check(&self, model: &AuctionModel) -> bool {
        model
            .partner_last_call_semantics()
            .map(|s| s.annotations.contains(&Annotation::Overcall))
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use types::Position;

    #[test]
    fn test_we_opened_they_opened() {
        let mut auction = types::Auction::bidding(Position::North, "P 1C");

        // Now it's South's (NS) turn
        let model = AuctionModel::from_auction(&auction);

        let we = WeOpened;
        let they = TheyOpened;

        // EW opened, South is NS, so "they" opened.
        assert!(!we.check(&model));
        assert!(they.check(&model));

        // Let South pass, West (EW) bids 2C
        auction.bids("P 2C");

        // Now it's North's turn (NS)
        let model_north = AuctionModel::from_auction(&auction);
        // EW still opened. North is NS. So "they" opened.
        assert!(!we.check(&model_north));
        assert!(they.check(&model_north));

        // If North had opened 1S
        let mut auction2 = types::Auction::bidding(Position::North, "1S");
        // East's turn
        let model_east = AuctionModel::from_auction(&auction2);
        // North (NS) opened. East is EW. So "they" opened.
        assert!(!we.check(&model_east));
        assert!(they.check(&model_east));

        // West's turn after N: 1S, E: Pass, S: 2S, W: ?
        auction2.bids("P 2S");
        let model_west = AuctionModel::from_auction(&auction2);
        // North (NS) opened. West is EW. So "they" opened.
        assert!(!we.check(&model_west));
        assert!(they.check(&model_west));
    }

    #[test]
    fn test_rho_made_last_bid() {
        let pred = RhoMadeLastBid;

        // N opens 1C, E's turn — RHO (N) made the last bid
        let auction = types::Auction::bidding(Position::North, "1C");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model), "E is in direct seat after N's 1C");

        // N: 1S, E: P, S: P, W's turn — last bid was N (LHO), not RHO
        let auction = types::Auction::bidding(Position::North, "1S P P");
        let model = AuctionModel::from_auction(&auction);
        assert!(
            !pred.check(&model),
            "W is in balancing seat, not direct seat"
        );

        // N: 1C, E: P, S: 1S, W's turn — last bid was S (RHO)
        let auction = types::Auction::bidding(Position::North, "1C P 1S");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model), "W is in direct seat after S's 1S");

        // N: 1C, E: X, S: P, W's turn — last bidder is N (LHO), not RHO
        // E's double is not a bid, so it doesn't count
        let auction = types::Auction::bidding(Position::North, "1C X P");
        let model = AuctionModel::from_auction(&auction);
        assert!(
            !pred.check(&model),
            "Double is not a bid — last bidder is N (LHO), not RHO (S)"
        );
    }

    #[test]
    fn test_we_have_not_acted() {
        let pred = WeHaveNotActed;

        // Empty auction — no one has bid
        let auction = types::Auction::new(Position::North);
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // N opens 1D, E's turn — EW has only passed
        let mut auction = types::Auction::bidding(Position::North, "1D");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // N: 1D, E: 1H, S: P, W's turn — EW HAS bid (E bid 1H)
        auction.bids("1H P");
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));

        // N: P, E: P, S's turn — NS has only passed
        let auction = types::Auction::bidding(Position::North, "P P");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // N: 1C, E: X, S: P, W's turn — EW has doubled (not only passed)
        let auction = types::Auction::bidding(Position::North, "1C X P");
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));
    }

    #[test]
    fn test_last_bid_max_level() {
        let pred = LastBidMaxLevel(1);

        // N opens 1C — last bid is level 1
        let auction = types::Auction::bidding(Position::North, "1C");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // N opens 2D — last bid is level 2, exceeds max
        let auction = types::Auction::bidding(Position::North, "2D");
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));

        // Empty auction — no bids at all
        let auction = types::Auction::new(Position::North);
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));
    }

    #[test]
    fn test_bidder_has_not_acted() {
        let pred = BidderHasNotActed;

        // N opens 1C, E overcalls 1S, S's turn — S hasn't acted yet
        let auction = types::Auction::bidding(Position::North, "1C 1S");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model), "S hasn't bid yet");

        // N opens 1C, it's E's turn — E hasn't acted yet
        let auction = types::Auction::bidding(Position::North, "1C");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model), "E hasn't bid yet");

        // N opens 1C, E passes, S passes, W passes, N's turn again
        // N already bid 1C, so BidderHasNotActed is false for N
        let auction = types::Auction::bidding(Position::North, "1C P P P");
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model), "N already opened 1C");

        // Unlike WeHaveNotActed, partner's bid doesn't affect us
        // N opens 1C, E overcalls 1S — S's turn. Partner (N) bid 1C but S hasn't.
        let auction = types::Auction::bidding(Position::North, "1C 1S");
        let model = AuctionModel::from_auction(&auction);
        let we_pred = WeHaveNotActed;
        assert!(!we_pred.check(&model), "WeHaveNotActed is false (N bid 1C)");
        assert!(
            pred.check(&model),
            "BidderHasNotActed is true (S hasn't bid)"
        );
    }

    #[test]
    fn test_has_unbid_major() {
        let pred = HasUnbidMajor;

        // N: 1C, E: 1S, S's turn — hearts is unbid
        let auction = types::Auction::bidding(Position::North, "1C 1S");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model), "Hearts is unbid");

        // N: 1H, E: 2S, S's turn — both majors shown
        let auction = types::Auction::bidding(Position::North, "1H 2S");
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model), "Both majors are shown");

        // N: 1D, E: 2C, S's turn — both majors unbid
        let auction = types::Auction::bidding(Position::North, "1D 2C");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model), "Both majors are unbid");
    }

    #[test]
    fn test_partner_overcalled() {
        let pred = PartnerOvercalled;

        // N: 1D, E: 1S (overcall), S: P, W's turn
        // W's partner (E) overcalled — should have Overcall annotation
        let auction = types::Auction::bidding(Position::North, "1D 1S P");
        let model = AuctionModel::from_auction(&auction);
        assert!(
            pred.check(&model),
            "W's partner (E) overcalled 1S — should have Overcall annotation"
        );

        // N: 1D, E: 1S, S's turn
        // S's partner (N) opened, not overcalled
        let auction = types::Auction::bidding(Position::North, "1D 1S");
        let model = AuctionModel::from_auction(&auction);
        assert!(
            !pred.check(&model),
            "S's partner (N) opened 1D — should NOT have Overcall annotation"
        );

        // N: 1D, E's turn — partner (W) hasn't bid yet
        let auction = types::Auction::bidding(Position::North, "1D");
        let model = AuctionModel::from_auction(&auction);
        assert!(
            !pred.check(&model),
            "E's partner (W) hasn't acted — no annotations"
        );
    }

    #[test]
    fn test_last_bid_is_suit() {
        let pred = LastBidIsSuit;

        // N opens 1C — last bid is clubs (a suit)
        let auction = types::Auction::bidding(Position::North, "1C");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // N: 1C, E: 1N — last bid is NT (not a suit)
        let auction = types::Auction::bidding(Position::North, "1C 1N");
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));

        // N: 1C, E: 1S — last bid is spades (a suit)
        let auction = types::Auction::bidding(Position::North, "1C 1S");
        let model = AuctionModel::from_auction(&auction);
        assert!(pred.check(&model));

        // Empty auction — no bids
        let auction = types::Auction::new(Position::North);
        let model = AuctionModel::from_auction(&auction);
        assert!(!pred.check(&model));
    }
}
