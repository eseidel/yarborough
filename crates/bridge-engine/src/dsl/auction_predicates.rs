use crate::nbk::AuctionModel;
use std::fmt::Debug;

pub trait AuctionPredicate: Send + Sync + Debug {
    fn check(&self, auction: &AuctionModel) -> bool;
}

pub fn not_auction(predicate: impl AuctionPredicate + 'static) -> NotAuction {
    NotAuction(Box::new(predicate))
}

#[derive(Debug)]
pub struct NotAuction(pub Box<dyn AuctionPredicate>);
impl AuctionPredicate for NotAuction {
    fn check(&self, auction: &AuctionModel) -> bool {
        !self.0.check(auction)
    }
}

#[derive(Debug)]
pub struct IsSeat(pub u8);
impl AuctionPredicate for IsSeat {
    fn check(&self, auction: &AuctionModel) -> bool {
        auction.auction.current_seat() == self.0
    }
}

#[derive(Debug)]
pub struct IsOpen;
impl AuctionPredicate for IsOpen {
    fn check(&self, auction: &AuctionModel) -> bool {
        auction.auction.is_open()
    }
}

#[derive(Debug)]
pub struct IsNotOpen;
impl AuctionPredicate for IsNotOpen {
    fn check(&self, auction: &AuctionModel) -> bool {
        !auction.auction.is_open()
    }
}

#[derive(Debug)]
pub struct PartnerLimited;
impl AuctionPredicate for PartnerLimited {
    fn check(&self, auction: &AuctionModel) -> bool {
        auction.partner_model.max_hcp.is_some()
    }
}
