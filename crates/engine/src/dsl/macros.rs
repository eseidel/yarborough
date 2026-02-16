#[macro_export]
macro_rules! expand_rule_field {
    (
        $call:expr, $level:expr, $strain:expr,
        $str:literal
    ) => {
        $str.to_string()
    };
    (
        $call:expr, $level:expr, $strain:expr,
        format ! $fmt_args:tt
    ) => {
         format!($crate::extract_fmt! $fmt_args, level=$level, strain=$strain)
    };
    (
        $call:expr, $level:expr, $strain:expr,
        format_level ! $fmt_args:tt
    ) => {
         format!($crate::extract_fmt! $fmt_args, level=$level)
    };
    (
        $call:expr, $level:expr, $strain:expr,
        format_strain ! $fmt_args:tt
    ) => {
         format!($crate::extract_fmt! $fmt_args, strain=$strain)
    };
}

#[macro_export]
macro_rules! extract_fmt {
    ( ($fmt:literal) ) => {
        $fmt
    };
    ( $fmt:literal ) => {
        $fmt
    };
}

#[macro_export]
macro_rules! expand_rule_fallback {
    (
        $str:literal
    ) => {
        $str.to_string()
    };
    (
        $macro_name:ident ! $fmt_args:tt
    ) => {
        $crate::extract_fmt! $fmt_args.to_string()
    };
}

#[macro_export]
macro_rules! bidding_rule {
    (
        struct $struct_name:ident;
        $($rest:tt)*
    ) => {
        $crate::bidding_rule!(@parse $struct_name, { name: (), auction: (), call: (), shows: (), planner: () }, $($rest)*);
    };

    // TERMINAL RULES
    (@parse $s:ident, { name: $n:tt, auction: $a:tt, call: $c:tt, shows: $sh:tt, planner: $p:tt }, ) => {
        $crate::bidding_rule!(@generate $s, $n, $a, $c, $sh, $p);
    };
    (@parse $s:ident, { name: $n:tt, auction: $a:tt, call: $c:tt, shows: $sh:tt, planner: $p:tt } ) => {
        $crate::bidding_rule!(@generate $s, $n, $a, $c, $sh, $p);
    };

    // NAME
    (@parse $s:ident, { name: (), auction: $a:tt, call: $c:tt, shows: $sh:tt, planner: $p:tt }, name: $lit:literal, $($rest:tt)*) => {
        $crate::bidding_rule!(@parse $s, { name: ($lit), auction: $a, call: $c, shows: $sh, planner: $p }, $($rest)*);
    };
    (@parse $s:ident, { name: (), auction: $a:tt, call: $c:tt, shows: $sh:tt, planner: $p:tt }, name: $m:ident ! $args:tt, $($rest:tt)*) => {
        $crate::bidding_rule!(@parse $s, { name: ($m ! $args), auction: $a, call: $c, shows: $sh, planner: $p }, $($rest)*);
    };


    // AUCTION
    (@parse $s:ident, { name: $n:tt, auction: (), call: $c:tt, shows: $sh:tt, planner: $p:tt }, auction: [ $( $a_pred:expr ),* $(,)? ], $($rest:tt)*) => {
        $crate::bidding_rule!(@parse $s, { name: $n, auction: ([ $($a_pred),* ]), call: $c, shows: $sh, planner: $p }, $($rest)*);
    };

    // CALL
    (@parse $s:ident, { name: $n:tt, auction: $a:tt, call: (), shows: $sh:tt, planner: $p:tt }, call: [ $( $c_pred:expr ),* $(,)? ], $($rest:tt)*) => {
        $crate::bidding_rule!(@parse $s, { name: $n, auction: $a, call: ([ $($c_pred),* ]), shows: $sh, planner: $p }, $($rest)*);
    };

    // SHOWS
    (@parse $s:ident, { name: $n:tt, auction: $a:tt, call: $c:tt, shows: (), planner: $p:tt }, shows: [ $( $sh_pred:expr ),* $(,)? ], $($rest:tt)*) => {
        $crate::bidding_rule!(@parse $s, { name: $n, auction: $a, call: $c, shows: ([ $($sh_pred),* ]), planner: $p }, $($rest)*);
    };
    (@parse $s:ident, { name: $n:tt, auction: $a:tt, call: $c:tt, shows: (), planner: $p:tt }, shows: [ $( $sh_pred:expr ),* $(,)? ]) => {
        $crate::bidding_rule!(@parse $s, { name: $n, auction: $a, call: $c, shows: ([ $($sh_pred),* ]), planner: $p });
    };

    // PLANNER
    (@parse $s:ident, { name: $n:tt, auction: $a:tt, call: $c:tt, shows: $sh:tt, planner: () }, planner: $p_type:ident, $($rest:tt)*) => {
        $crate::bidding_rule!(@parse $s, { name: $n, auction: $a, call: $c, shows: $sh, planner: (Some(std::sync::Arc::new($p_type))) }, $($rest)*);
    };
    (@parse $s:ident, { name: $n:tt, auction: $a:tt, call: $c:tt, shows: $sh:tt, planner: () }, planner: $p_type:ident) => {
        $crate::bidding_rule!(@parse $s, { name: $n, auction: $a, call: $c, shows: $sh, planner: (Some(std::sync::Arc::new($p_type))) });
    };

    // GENERATE
    (@generate
        $struct_name:ident,
        ($($name_expanded:tt)+),
        ([$($auction_pred:expr),*]),
        ([$($call_pred:expr),*]),
        ([$($shows_pred:expr),*]),
        $planner_expr:tt
    ) => {
        pub struct $struct_name;

        impl $crate::dsl::bidding_rule::BiddingRule for $struct_name {
            fn name(&self, call: &types::Call) -> String {
                match call {
                    types::Call::Bid { level, strain } => {
                        #[allow(unused_variables)]
                        let (level, strain) = (level, strain);
                        $crate::expand_rule_field!(call, level, strain, $($name_expanded)+)
                    }
                    _ => $crate::expand_rule_fallback!( $($name_expanded)+ ),
                }
            }

            fn auction_criteria(&self) -> Vec<Box<dyn $crate::dsl::auction_predicates::AuctionPredicate>> {
                vec![ $( Box::new($auction_pred) ),* ]
            }

            fn call_predicates(&self) -> Vec<Box<dyn $crate::dsl::call_predicates::CallPredicate>> {
                vec![ $( Box::new($call_pred) ),* ]
            }

            fn shows(&self) -> Vec<Box<dyn $crate::dsl::shows::Shows>> {
                vec![ $( Box::new($shows_pred) ),* ]
            }

            fn planner(&self) -> Option<std::sync::Arc<dyn $crate::dsl::planner::Planner>> {
                $crate::unwrap_planner!($planner_expr)
            }
        }
    };
}

#[macro_export]
macro_rules! unwrap_planner {
    (()) => {
        None
    };
    (($e:expr)) => {
        $e
    };
}
