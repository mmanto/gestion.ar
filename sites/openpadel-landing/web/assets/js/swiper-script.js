$(function(){
   var swiperPartner = new Swiper('.swiper.swiperpartner',{
        autoplay: {
            delay: 5000,
        },
        speed: 1000,
        slidesPerView: 5,
        spaceBetween: 10,
        loop: true,
        hasNavigation: true,
        grabCursor: false,
        breakpoints: {
            0: {
                slidesPerView: 3
            },
            768: {
                slidesPerView: 5
            }
        },
        pagination: {
        enabled: true,
        el: '.swiper-pagination',
        type: 'bullets',
        clickable: true,
        },
   });
});

var swiperBooking = new Swiper('.swiper.swiperbooking', {
    slidesPerView: 1,
    spaceBetween: 0,
    loop: true,
    autoplay: {
        delay: 4000,
    },
    speed: 800,
    pagination: {
        el: '.swiperbooking .swiper-pagination',
        clickable: true,
    },
    navigation: {
        nextEl: '.swiperbooking .swiper-button-next',
        prevEl: '.swiperbooking .swiper-button-prev',
    },
    grabCursor: true
});
