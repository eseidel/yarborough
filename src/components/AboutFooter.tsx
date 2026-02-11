export function AboutFooter() {
  return (
    <footer className="mt-8 mb-4 px-4 text-sm text-gray-600 space-y-3">
      <h3 className="text-base font-semibold text-gray-800">
        About SAYCBridge.com
      </h3>
      <p>
        Practice bidding{" "}
        <a
          href="https://en.wikipedia.org/wiki/Standard_American"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Standard American Yellow Card
        </a>{" "}
        (SAYC).
      </p>
      <p>
        The autobidder is designed to follow the official{" "}
        <a
          href="http://web2.acbl.org/documentlibrary/play/SP3%20(bk)%20single%20pages.pdf"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          ACBL pamphlet
        </a>{" "}
        as well as the excellent{" "}
        <a
          href="https://www.amazon.com/gp/product/1897106033"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          <i>Standard Bidding With SAYC</i>
        </a>{" "}
        by{" "}
        <a
          href="http://www.mauibridge.com/"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ned Downey
        </a>{" "}
        and{" "}
        <a
          href="http://www.bridge-forum.com/"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ellen Pomer
        </a>
        .
      </p>
      <p>
        Although constructive bidding works well, competitive bidding (and
        especially slam bidding) need improvement.
      </p>
      <p>
        We would love to hear your suggestions! Reach us via{" "}
        <a
          href="mailto:contact@saycbridge.com"
          className="text-blue-600 hover:underline"
        >
          email
        </a>{" "}
        or{" "}
        <a
          href="https://twitter.com/SAYCBridge"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          twitter
        </a>
        . You can find the{" "}
        <a
          href="https://github.com/eseidel/yarborough"
          className="text-blue-600 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          source code to SAYCBridge.com
        </a>{" "}
        on GitHub.
      </p>
      <p>Happy bidding!</p>
    </footer>
  );
}
