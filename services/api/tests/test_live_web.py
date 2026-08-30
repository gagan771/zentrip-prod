from app.live_web import _hours_excerpt, _resolve_place


def test_live_resolver_uses_allowlisted_official_place_source():
    place = _resolve_place("Is Qutb Minar open today?")

    assert place == (
        "Qutb Minar",
        "Delhi",
        "https://www.delhitourism.gov.in/tourist_place/qutab_minar.html",
    )


def test_hours_excerpt_prefers_operational_text_over_navigation_text():
    html = """
    <html><body>
      <nav>Visiting Hours &amp; Ticketing Nearby Attractions</nav>
      <main><p>Taj Mahal is closed on every Friday. Ticket windows open one hour before Sunrise.</p></main>
    </body></html>
    """

    excerpt = _hours_excerpt(html)

    assert excerpt is not None
    assert "closed on every Friday" in excerpt
    assert "Ticket windows open" in excerpt
