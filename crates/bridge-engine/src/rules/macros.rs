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
        format! $fmt_args:tt
    ) => {
         format!($crate::extract_fmt! $fmt_args, level=$level, strain=$strain)
    };
    (
        $call:expr, $level:expr, $strain:expr,
        format_level! $fmt_args:tt
    ) => {
         format!($crate::extract_fmt! $fmt_args, level=$level)
    };
    (
        $call:expr, $level:expr, $strain:expr,
        format_strain! $fmt_args:tt
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
        $macro_name:ident ! ($fmt:literal)
    ) => {
        $fmt.to_string()
    };
}

#[macro_export]
macro_rules! bidding_rule {
    // Entry point
    (
        struct $struct_name:ident;
        $($rest:tt)*
    ) => {
        $crate::bidding_rule!(@parse $struct_name, name=(), desc=(), auction=(), call=(), shows=(); $($rest)*);
    };

    // Parse Name
    (@parse $s:ident, name=(), desc=(), auction=(), call=(), shows=(); name: $lit:literal, $($rest:tt)*) => {
        $crate::bidding_rule!(@parse $s, name=($lit), desc=(), auction=(), call=(), shows=(); $($rest)*);
    };
    (@parse $s:ident, name=(), desc=(), auction=(), call=(), shows=(); name: $m:ident! $args:tt, $($rest:tt)*) => {
        $crate::bidding_rule!(@parse $s, name=($m! $args), desc=(), auction=(), call=(), shows=(); $($rest)*);
    };

    // Parse Description
    (@parse $s:ident, name=$n:tt, desc=(), auction=(), call=(), shows=(); description: $lit:literal, $($rest:tt)*) => {
        $crate::bidding_rule!(@parse $s, name=$n, desc=($lit), auction=(), call=(), shows=(); $($rest)*);
    };
    (@parse $s:ident, name=$n:tt, desc=(), auction=(), call=(), shows=(); description: $m:ident! $args:tt, $($rest:tt)*) => {
        $crate::bidding_rule!(@parse $s, name=$n, desc=($m! $args), auction=(), call=(), shows=(); $($rest)*);
    };

    // Parse Auction
    (@parse $s:ident, name=$n:tt, desc=$d:tt, auction=(), call=(), shows=(); auction: [ $( $a:expr ),* $(,)? ], $($rest:tt)*) => {
        $crate::bidding_rule!(@parse $s, name=$n, desc=$d, auction=([$($a),*]), call=(), shows=(); $($rest)*);
    };

    // Parse Call
    (@parse $s:ident, name=$n:tt, desc=$d:tt, auction=$a:tt, call=(), shows=(); call: [ $( $c:expr ),* $(,)? ], $($rest:tt)*) => {
        $crate::bidding_rule!(@parse $s, name=$n, desc=$d, auction=$a, call=([$($c),*]), shows=(); $($rest)*);
    };

    // Parse Shows
    (@parse $s:ident, name=$n:tt, desc=$d:tt, auction=$a:tt, call=$c:tt, shows=(); shows: [ $( $sh:expr ),* $(,)? ]) => {
        $crate::bidding_rule!(@generate $s, $n, $d, $a, $c, ([ $($sh),* ]));
    };
    (@parse $s:ident, name=$n:tt, desc=$d:tt, auction=$a:tt, call=$c:tt, shows=(); shows: [ $( $sh:expr ),* $(,)? ],) => {
        $crate::bidding_rule!(@generate $s, $n, $d, $a, $c, ([ $($sh),* ]));
    };

    // Generate Impl
    (@generate
        $struct_name:ident,
        ($($name_expanded:tt)+),
        ($($desc_expanded:tt)+),
        ([$($auction_pred:expr),*]),
        ([$($call_pred:expr),*]),
        ([$($shows_pred:expr),*])
    ) => {
        pub struct $struct_name;

        impl $crate::rules::bidding_rule::BiddingRule for $struct_name {
            fn name(&self, call: &bridge_core::Call) -> String {
                match call {
                    bridge_core::Call::Bid { level, strain } => {
                        #[allow(unused_variables)]
                        let (level, strain) = (level, strain);
                        $crate::expand_rule_field!(call, level, strain, $($name_expanded)+)
                    }
                    _ => $crate::expand_rule_fallback!( $($name_expanded)+ ),
                }
            }

            fn description(&self, call: &bridge_core::Call) -> String {
                match call {
                    bridge_core::Call::Bid { level, strain } => {
                        #[allow(unused_variables)]
                        let (level, strain) = (level, strain);
                        $crate::expand_rule_field!(call, level, strain, $($desc_expanded)+)
                    }
                    _ => $crate::expand_rule_fallback!( $($desc_expanded)+ ),
                }
            }

            fn auction_criteria(&self) -> Vec<Box<dyn $crate::rules::auction_predicates::AuctionPredicate>> {
                vec![ $( Box::new($auction_pred) ),* ]
            }

            fn call_predicates(&self) -> Vec<Box<dyn $crate::rules::call_predicates::CallPredicate>> {
                vec![ $( Box::new($call_pred) ),* ]
            }

            fn shows(&self) -> Vec<Box<dyn $crate::rules::shows::Shows>> {
                vec![ $( Box::new($shows_pred) ),* ]
            }
        }
    };
}
