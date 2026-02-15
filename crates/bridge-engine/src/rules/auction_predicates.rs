use crate::nbk::AuctionModel;
use std::fmt::Debug;

pub trait AuctionPredicate: Send + Sync + Debug {
    fn check(&self, auction: &AuctionModel) -> bool;
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
        auction.auction.current_seat() as u8 == self.0
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
