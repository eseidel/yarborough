use wasm_bindgen::prelude::*;

/// Given a call history string, dealer position, and vulnerability, return
/// possible next calls with their interpretations from the NBK bidding system.
#[wasm_bindgen]
pub fn get_interpretations(calls_string: &str, dealer: &str, vulnerability: &str) -> JsValue {
    serde_wasm_bindgen::to_value(&bridge_engine::get_interpretations(
        calls_string,
        dealer,
        vulnerability,
    ))
    .unwrap()
}

/// Receives a board and auction state in the "identifier" format
/// and returns the next bid as a call string.
#[wasm_bindgen]
pub fn get_next_bid(identifier: &str) -> String {
    bridge_engine::get_next_bid(identifier)
}

/// Like get_next_bid, but returns the bid along with its rule name and description.
#[wasm_bindgen]
pub fn get_suggested_bid(identifier: &str) -> JsValue {
    serde_wasm_bindgen::to_value(&bridge_engine::get_suggested_bid(identifier)).unwrap()
}

#[wasm_bindgen]
pub fn generate_filtered_board(deal_type: &str) -> String {
    bridge_engine::generate_filtered_board(deal_type)
}
