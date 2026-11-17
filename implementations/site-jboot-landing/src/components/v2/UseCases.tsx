"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import { v2Content } from "@/content/v2-content";

export function UseCases() {
  return (
    <section className="section bg-light" id={v2Content.useCases.id}>
      <div className="container">
        <h3 className="mb-4 fw-semibold text-center">{v2Content.useCases.headline}</h3>

        <Swiper
          modules={[Autoplay, Pagination]}
          autoplay={{ delay: 3200, disableOnInteraction: false }}
          pagination={{ clickable: true }}
          loop
          spaceBetween={20}
          slidesPerView={1}
          breakpoints={{ 768: { slidesPerView: 2 }, 1200: { slidesPerView: 3 } }}
          className="pb-5"
        >
          {v2Content.useCases.items.map(item => (
            <SwiperSlide key={item.title}>
              <div className="card h-100 border-0 shadow-sm">
                <div className="card-body">
                  <h6 className="fw-semibold">{item.title}</h6>
                  <p className="text-muted small mb-0">{item.description}</p>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}
