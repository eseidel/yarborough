use wasm_bindgen::prelude::*;

/// Given a call history string, dealer position, and vulnerability, return
/// possible next calls with their interpretations from the NBK bidding system.
#[wasm_bindgen]
pub fn get_call_interpretations(calls_string: &str, dealer: &str, vulnerability: &str) -> JsValue {
    serde_wasm_bindgen::to_value(&engine::get_call_interpretations(
        calls_string,
        dealer,
        vulnerability,
    ))
    .unwrap()
}

/// Receives a board and auction state in the "identifier" format
/// and returns the next call as a call string.
#[wasm_bindgen]
pub fn get_next_call(identifier: &str) -> String {
    engine::get_next_call(identifier)
}

/// Like get_next_call, but returns the call along with its rule name and description.
#[wasm_bindgen]
pub fn get_suggested_call(identifier: &str) -> JsValue {
    serde_wasm_bindgen::to_value(&engine::get_suggested_call(identifier)).unwrap()
}

#[wasm_bindgen]
pub fn generate_filtered_board(deal_type: &str) -> String {
    engine::generate_filtered_board(deal_type)
}
