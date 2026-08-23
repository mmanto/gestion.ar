$(document).ready(function() {
    initCustomDropdown();
    initFlatpickrCalendar();
    initNavLink();
    initSidebar();
    initSidebarDropdown();
    initCounter();
    initTestimonialSlider();
    initAnimateData();
    initSubmitBooking(); 
    initSubmitForm();
    initSubmitNewsletter();
});

function initCustomDropdown() {
    $('.dropdown-select').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const $container = $(this).closest('.dropdown-container');
        const $caretIcon = $(this).find('.fa-caret-down');
        $('.dropdown-container').not($container).removeClass('active');
        $('.fa-caret-down').not($caretIcon).removeClass('rotate');
        $container.toggleClass('active');
        $caretIcon.toggleClass('rotate');
    });

    $('.dropdown-option').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const $option = $(this);
        const $container = $option.closest('.dropdown-container');
        const $selectedText = $container.find('.selected-text');
        const $hiddenInput = $container.find('.dropdown-value');
        const $allOptions = $container.find('.dropdown-option');
        const selectedValue = $option.data('value');
        const selectedText = $option.text().trim();
        $selectedText.text(selectedText);
        $selectedText.addClass('has-value');
        $hiddenInput.val(selectedValue);
        $allOptions.removeClass('selected');
        $option.addClass('selected');
        $container.removeClass('active');
        $container.find('.fa-caret-down').removeClass('rotate');
        $hiddenInput.trigger('change');
        console.log('Selected:', selectedValue, selectedText);
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('.dropdown-container').length) {
            $('.dropdown-container').removeClass('active');
            $('.fa-caret-down').removeClass('rotate');
        }
    });

    $('.dropdown-select').on('keydown', function(e) {
        const $container = $(this).closest('.dropdown-container');
        switch(e.key) {
            case 'Enter':
            case ' ':
                e.preventDefault();
                $(this).click();
                break;
            case 'Escape':
                $container.removeClass('active');
                $container.find('.fa-caret-down').removeClass('rotate');
                break;
            case 'ArrowDown':
            case 'ArrowUp':
                e.preventDefault();
                if (!$container.hasClass('active')) {
                    $container.addClass('active');
                    $container.find('.fa-caret-down').addClass('rotate');
                }
                const $options = $container.find('.dropdown-option');
                const $focused = $options.filter(':focus');
                let nextIndex;
                if ($focused.length === 0) {
                    nextIndex = e.key === 'ArrowDown' ? 0 : $options.length - 1;
                } else {
                    const currentIndex = $options.index($focused);
                    if (e.key === 'ArrowDown') {
                        nextIndex = currentIndex + 1 >= $options.length ? 0 : currentIndex + 1;
                    } else {
                        nextIndex = currentIndex - 1 < 0 ? $options.length - 1 : currentIndex - 1;
                    }
                }
                $options.eq(nextIndex).focus();
                break;
        }
    });

    $('.dropdown-option').attr('tabindex', '0');

    $('.dropdown-option').on('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            $(this).click();
        }
    });

    window.resetDropdown = function(containerId) {
        const $container = $('#' + containerId);
        if ($container.length) {
            $container.find('.selected-text').text('Services').removeClass('has-value');
            $container.find('.dropdown-value').val('');
            $container.find('.dropdown-option').removeClass('selected');
            $container.removeClass('active');
            $container.find('.fa-caret-down').removeClass('rotate');
        }
    };

    window.getDropdownValue = function(containerId) {
        const $container = $('#' + containerId);
        return $container.find('.dropdown-value').val();
    };

    window.setDropdownValue = function(containerId, value) {
        const $container = $('#' + containerId);
        const $option = $container.find('.dropdown-option[data-value="' + value + '"]');
        if ($option.length) {
            $option.click();
        }
    };
}

function initFlatpickrCalendar() {
    var $date = $("#date");

    $date.flatpickr({
        dateFormat: "d M Y"
    });
}

function initCounter() {
    var $counters = $(".counter");

    function updateCount($counter) {
        var target = +$counter.data("target");
        var count = +$counter.text().replace("+", "");
        var duration = 1500;
        var steps = 30;
        var increment = Math.max(1, Math.ceil(target / steps));
        var delay = Math.floor(duration / (target / increment));
        var isYear = $counter.hasClass('counter-year');

        if (count < target) {
            var nextCount = Math.min(target, count + increment);
            if (isYear) {
                $counter.text(nextCount);
            } else {
                $counter.text(nextCount + "+");
            }
            setTimeout(function() {
                updateCount($counter);
            }, delay);
        } else {
            if (isYear) {
                $counter.text(target);
            } else {
                $counter.text(target + "+");
            }
        }
    }

    var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting && !$(entry.target).data('counted')) {
                var $counter = $(entry.target);
                $counter.data('counted', true);
                updateCount($counter);
            }
        });
    }, {
        threshold: 0.5
    });

    $counters.each(function() {
        var $counter = $(this);
        $counter.data('counted', false);
        observer.observe(this);
    });
}

function initTestimonialSlider() {
    var $slider = $("#testimonial-slider");
    var $slides = $(".testimonial-slide");
    var $navButtons = $(".testimonial-nav-btn");
    var $prevBtn = $("#prev");
    var $nextBtn = $("#next");

    var currentIndex = 0;
    var totalSlides = $slides.length;

    function updateSlider() {
        $slider.css("transform", "translateX(-" + (currentIndex * 100) + "%)");

        $slides.each(function(i) {
            $(this).toggleClass("active", i === currentIndex);
        });

        $navButtons.each(function(i) {
            $(this).toggleClass("active", i === currentIndex);
        });
    }

    $nextBtn.on("click", function() {
        currentIndex = (currentIndex + 1) % totalSlides;
        updateSlider();
    });

    $prevBtn.on("click", function() {
        currentIndex = (currentIndex - 1 + totalSlides) % totalSlides;
        updateSlider();
    });

    $navButtons.each(function(index) {
        $(this).on("click", function() {
            currentIndex = index;
            updateSlider();
        });
    });

    updateSlider();
}

$(document).ready(function() {
    initTestimonialSlider();
});

function initTabButton() {
    var $buttons = $(".tab-btn");
    var $panes = $(".tab-pane");

    $buttons.on("click", function() {
        $buttons.removeClass("active");
        $(this).addClass("active");

        $panes.removeClass("active");
        var target = $(this).data("tab");
        $("#" + target).addClass("active");
    });
}

$(document).ready(function() {
    initTabButton();
});

function initNavLink() {
    const currentUrl = window.location.href;
    $(".navbar-nav .nav-link").each(function() {
        if (this.href === currentUrl) {
            $(this).addClass("active");
        }
    });
    $(".navbar-nav .dropdown-menu .dropdown-item").each(function() {
        if (this.href === currentUrl) {
            $(this).addClass("active");
            $(this).closest(".dropdown").find(".nav-link.dropdown-toggle").addClass("active");
        }
    });
}

function initSidebar() {
    const $menuBtn = $('.nav-btn');
    const $closeBtn = $('.close-btn');
    const $overlay = $('.sidebar-overlay');
    const $sidebar = $('.sidebar');
  
    $menuBtn.click(function() {
      $overlay.addClass('active');
      setTimeout(() => {
        $sidebar.addClass('active');
      }, 200);
    });
  
    $closeBtn.click(function() {
      $sidebar.removeClass('active');
      setTimeout(() => {
        $overlay.removeClass('active');
      }, 200);
    });
  
    $overlay.click(function() {
      $sidebar.removeClass('active');
      setTimeout(() => {
        $overlay.removeClass('active');
      }, 200);
    });
}

function initEditSidebar() {
    const $contentBtn = $('.content-edit');
    const $closeBtn = $('.close-btn-second');
    const $overlay = $('.content-overlay');
    const $sidebar = $('.content-edit-sidebar');

    $contentBtn.click(function() {
        $sidebar.addClass('active');
        setTimeout(() => {
            $overlay.addClass('active');    
        }, 200);
    });

    $closeBtn.click(function() {
        $sidebar.removeClass('active');
        setTimeout(() => {
            $overlay.removeClass('active');
        }, 200);
    });
}

function initSidebarDropdown() {
    const $dropdownButtons = $(".sidebar-dropdown-btn");

    $dropdownButtons.each(function() {
        $(this).on("click", function() {
            const $dropdownMenu = $(this).parent().next(".sidebar-dropdown-menu");
            const isOpen = $dropdownMenu.hasClass("active");

            $(".sidebar-dropdown-menu").not($dropdownMenu).removeClass("active");

            $dropdownMenu.toggleClass("active", !isOpen);
        });
    });
}

function initAnimateData() {
    const $elements = $('[data-animate]');
    const observer = new window.IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const $el = $(entry.target);
                const delay = $el.data('delay') || 0;
                setTimeout(() => {
                    $el.addClass($el.data('animate'));
                    $el.css('opacity', 1);
                    observer.unobserve(entry.target);
                }, delay);
            }
        });
    }, {
        threshold: 0.1
    });
    $elements.each(function() {
        observer.observe(this);
    });
}