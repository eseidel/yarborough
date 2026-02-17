#[macro_export]
macro_rules! bidding_rule {
    (
        $struct_name:ident: $name_str:literal,
        auction: [ $( $a_pred:expr ),* $(,)? ],
        call: [ $( $c_pred:expr ),* $(,)? ],
        shows: [ $( $shows_pred:expr ),* $(,)? ]
        $(, annotations: [ $( $ann:ident ),* $(,)? ] )?
        $(, planner: $planner_expr:ident )?
        $(,)?
    ) => {
        pub struct $struct_name;

        impl $crate::dsl::bidding_rule::BiddingRule for $struct_name {
            fn name(&self, _call: &types::Call) -> String {
                $name_str.to_string()
            }

            fn auction_criteria(&self) -> Vec<Box<dyn $crate::dsl::auction_predicates::AuctionPredicate>> {
                vec![ $( Box::new($a_pred) ),* ]
            }

            fn call_predicates(&self) -> Vec<Box<dyn $crate::dsl::call_predicates::CallPredicate>> {
                vec![ $( Box::new($c_pred) ),* ]
            }

            fn shows(&self) -> Vec<Box<dyn $crate::dsl::shows::Shows>> {
                vec![ $( Box::new($shows_pred) ),* ]
            }

            fn annotations(&self) -> Vec<$crate::dsl::annotations::Annotation> {
                vec![ $( $( $crate::dsl::annotations::Annotation::$ann ),* )? ]
            }

            fn planner(&self) -> Option<std::sync::Arc<dyn $crate::dsl::planner::Planner>> {
                None $( .or(Some(std::sync::Arc::new($planner_expr))) )?
            }
        }
    };
}
